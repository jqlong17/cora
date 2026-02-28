/**
 * Cora Marked 只读预览模式（方案二：含 HTML 的 md 用 marked 渲染，编辑仅源码）
 * 双 Tab：预览（只读 HTML）/ Markdown（源码编辑），不加载 Milkdown
 */
(function () {
    'use strict';

    const debug = (msg) => console.log('[Cora Marked] ' + msg);

    function loadScript(url) {
        return new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = url;
            s.onload = function () { resolve(true); };
            s.onerror = function () { resolve(false); };
            document.head.appendChild(s);
        });
    }

    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    const editorEl = document.querySelector('#marked-preview');
    const previewContainer = document.getElementById('marked-preview-container');
    const sourceContainer = document.getElementById('source-editor-container');
    const textarea = document.getElementById('source-textarea');
    const lineNumbersEl = document.getElementById('source-line-numbers');
    const tabVisual = document.getElementById('tab-visual');
    const tabSource = document.getElementById('tab-source');
    const contentArea = document.querySelector('.content-area');
    let findBar = null;
    let findInput = null;
    let findCount = null;
    let findMatches = [];
    let findActiveIdx = -1;
    let previewHitRanges = [];

    const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
    if (!vscode) {
        debug('acquireVsCodeApi not available');
        return;
    }

    let isSourceMode = false;

    const dataEl = document.getElementById('initial-markdown');
    const renderedEl = document.getElementById('initial-rendered-html');
    const initialContent = dataEl ? (function () {
        try { return JSON.parse(dataEl.textContent); } catch (e) { return ''; }
    })() : '';
    const initialRendered = renderedEl ? (function () {
        try { return JSON.parse(renderedEl.textContent); } catch (e) { return ''; }
    })() : '';

    function updateSourceLineNumbers() {
        const lineCount = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
        lineNumbersEl.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
    }

    function syncLineNumbersScroll() {
        lineNumbersEl.scrollTop = textarea.scrollTop;
    }

    function placeSourceCursorToLine(lineIdx) {
        const lines = textarea.value.split('\n');
        const totalLines = Math.max(1, lines.length);
        const safeLine = Math.max(0, Math.min(totalLines - 1, lineIdx));
        const charPos = lines.slice(0, safeLine).reduce((n, line) => n + line.length + 1, 0);
        textarea.focus();
        textarea.setSelectionRange(charPos, charPos);
        const lineHeight = textarea.scrollHeight / totalLines;
        textarea.scrollTop = Math.max(0, lineHeight * safeLine - 100);
        syncLineNumbersScroll();
    }
    function findLineByIndex(text, idx) {
        return (text.slice(0, Math.max(0, idx)).match(/\n/g) || []).length;
    }
    function supportsCustomHighlight() {
        return typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined' && typeof Highlight !== 'undefined';
    }
    function clearPreviewHighlights() {
        previewHitRanges = [];
        if (!supportsCustomHighlight()) return;
        try {
            CSS.highlights.delete('cora-find-hit');
            CSS.highlights.delete('cora-find-active');
        } catch {
            // ignore
        }
    }
    function collectTextNodes(root) {
        if (!root) return [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const out = [];
        let node = walker.nextNode();
        while (node) {
            const text = node.textContent || '';
            if (text.trim().length > 0) {
                out.push(node);
            }
            node = walker.nextNode();
        }
        return out;
    }
    function applyPreviewHighlights(query) {
        clearPreviewHighlights();
        const q = (query || '').trim();
        if (!q || isSourceMode || !supportsCustomHighlight()) return;
        const lowerQuery = q.toLowerCase();
        const ranges = [];
        for (const node of collectTextNodes(editorEl)) {
            const text = node.textContent || '';
            const lower = text.toLowerCase();
            let from = 0;
            while (from <= lower.length) {
                const at = lower.indexOf(lowerQuery, from);
                if (at === -1) break;
                const range = new Range();
                range.setStart(node, at);
                range.setEnd(node, at + lowerQuery.length);
                ranges.push(range);
                from = at + Math.max(1, lowerQuery.length);
            }
        }
        previewHitRanges = ranges;
        if (previewHitRanges.length === 0) return;
        const all = new Highlight(...previewHitRanges);
        CSS.highlights.set('cora-find-hit', all);
    }
    function setActivePreviewHighlight(idx) {
        if (!supportsCustomHighlight()) return;
        try {
            CSS.highlights.delete('cora-find-active');
        } catch {
            // ignore
        }
        if (isSourceMode || previewHitRanges.length === 0 || idx < 0) return;
        const safeIdx = idx % previewHitRanges.length;
        const active = previewHitRanges[safeIdx];
        if (!active) return;
        CSS.highlights.set('cora-find-active', new Highlight(active));
    }
    function buildFindMatches(query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return [];
        const text = textarea.value || '';
        const lower = text.toLowerCase();
        const out = [];
        let from = 0;
        while (from <= lower.length) {
            const at = lower.indexOf(q, from);
            if (at === -1) break;
            out.push({ start: at, end: at + q.length, line: findLineByIndex(text, at) });
            from = at + Math.max(1, q.length);
        }
        return out;
    }
    function updateFindCount() {
        if (!findCount) return;
        if (!findInput || !findInput.value.trim()) {
            findCount.textContent = '0/0';
            return;
        }
        const total = findMatches.length;
        const curr = total > 0 && findActiveIdx >= 0 ? (findActiveIdx + 1) : 0;
        findCount.textContent = curr + '/' + total;
    }
    function revealFindMatch(match, immediate) {
        if (!match) return;
        if (isSourceMode) {
            textarea.focus();
            textarea.setSelectionRange(match.start, match.end);
            placeSourceCursorToLine(match.line);
            setActivePreviewHighlight(-1);
            return;
        }
        scrollPreviewToLine(match.line, { immediate: immediate === true });
        setActivePreviewHighlight(findActiveIdx);
    }
    function jumpFind(delta, immediate) {
        if (findMatches.length === 0) {
            findActiveIdx = -1;
            updateFindCount();
            return;
        }
        if (findActiveIdx < 0) {
            findActiveIdx = 0;
        } else {
            const total = findMatches.length;
            findActiveIdx = (findActiveIdx + delta + total) % total;
        }
        revealFindMatch(findMatches[findActiveIdx], immediate === true);
        updateFindCount();
    }
    function refreshFindMatches(immediate) {
        if (!findInput) return;
        applyPreviewHighlights(findInput.value);
        findMatches = buildFindMatches(findInput.value);
        if (findMatches.length === 0) {
            findActiveIdx = -1;
            setActivePreviewHighlight(-1);
            updateFindCount();
            return;
        }
        if (findActiveIdx < 0 || findActiveIdx >= findMatches.length) {
            findActiveIdx = 0;
        }
        revealFindMatch(findMatches[findActiveIdx], immediate === true);
        updateFindCount();
    }
    function ensureFindBar() {
        if (findBar || !contentArea) return;
        const bar = document.createElement('div');
        bar.style.position = 'fixed';
        bar.style.zIndex = '1200';
        bar.style.display = 'none';
        bar.style.alignItems = 'center';
        bar.style.gap = '6px';
        bar.style.padding = '6px 8px';
        bar.style.borderRadius = '8px';
        bar.style.background = 'var(--vscode-editorWidget-background, #fff)';
        bar.style.border = '1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.15))';
        bar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.12)';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Find';
        input.style.width = '220px';
        input.style.height = '24px';
        input.style.padding = '2px 8px';
        input.style.borderRadius = '6px';
        input.style.border = '1px solid var(--vscode-widget-border, rgba(0,0,0,0.2))';
        input.style.background = 'var(--vscode-input-background, #fff)';
        input.style.color = 'var(--vscode-input-foreground, #24292f)';
        input.style.outline = 'none';

        const count = document.createElement('span');
        count.textContent = '0/0';
        count.style.minWidth = '44px';
        count.style.fontSize = '12px';
        count.style.color = 'var(--vscode-descriptionForeground, #666)';
        count.style.textAlign = 'center';

        const mkBtn = (label) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.height = '24px';
            b.style.minWidth = '26px';
            b.style.border = '1px solid var(--vscode-widget-border, rgba(0,0,0,0.2))';
            b.style.borderRadius = '6px';
            b.style.background = 'var(--vscode-button-secondaryBackground, #f3f4f6)';
            b.style.color = 'var(--vscode-button-secondaryForeground, #333)';
            b.style.cursor = 'pointer';
            return b;
        };
        const prevBtn = mkBtn('↑');
        const nextBtn = mkBtn('↓');
        const closeBtn = mkBtn('×');
        prevBtn.addEventListener('click', function () { jumpFind(-1, false); });
        nextBtn.addEventListener('click', function () { jumpFind(1, false); });
        closeBtn.addEventListener('click', function () { bar.style.display = 'none'; });
        input.addEventListener('input', function () {
            findActiveIdx = -1;
            refreshFindMatches(true);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                jumpFind(e.shiftKey ? -1 : 1, false);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                bar.style.display = 'none';
            }
        });
        bar.appendChild(input);
        bar.appendChild(count);
        bar.appendChild(prevBtn);
        bar.appendChild(nextBtn);
        bar.appendChild(closeBtn);
        contentArea.appendChild(bar);
        const placeFindBar = function () {
            const rect = contentArea.getBoundingClientRect();
            const top = Math.max(rect.top + 10, 54);
            const right = Math.max(window.innerWidth - rect.right + 12, 12);
            bar.style.top = top + 'px';
            bar.style.right = right + 'px';
        };
        placeFindBar();
        window.addEventListener('resize', placeFindBar);
        contentArea.addEventListener('scroll', placeFindBar, { passive: true });
        findBar = bar;
        findInput = input;
        findCount = count;
    }
    function openFindBar() {
        ensureFindBar();
        if (!findBar || !findInput) return;
        findBar.style.display = 'flex';
        findInput.focus();
        findInput.select();
        refreshFindMatches(true);
    }

    function switchToSource() {
        if (isSourceMode) return;
        const lineIdx = getCurrentPreviewLineIndex();
        isSourceMode = true;
        previewContainer.style.display = 'none';
        sourceContainer.style.display = 'block';
        tabVisual.classList.remove('active');
        tabSource.classList.add('active');
        placeSourceCursorToLine(lineIdx);
        if (findBar && findBar.style.display !== 'none') {
            refreshFindMatches(true);
        }
        hideSelectionToolbar();
        debug('切换至 Markdown 源码');
    }

    function switchToVisual() {
        if (!isSourceMode) return;
        const lineIdx = getCurrentSourceLineIndex();
        isSourceMode = false;
        sourceContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        previewContainer.style.visibility = 'hidden';
        tabSource.classList.remove('active');
        tabVisual.classList.add('active');
        scrollPreviewToLine(lineIdx, { immediate: true });
        if (findBar && findBar.style.display !== 'none') {
            refreshFindMatches(true);
        }
        requestAnimationFrame(() => { previewContainer.style.visibility = 'visible'; });
        hideSelectionToolbar();
        debug('切换至预览');
    }

    function normalizeKey(text) {
        return (text || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 160);
    }

    function stripMarkdownPrefix(line) {
        return (line || '')
            .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)+/, '')
            .replace(/^[`~]{1,3}/, '')
            .trim();
    }

    function extractMarkdownBlocks(markdown) {
        const lines = (markdown || '').split('\n');
        const blocks = [];
        let i = 0;
        while (i < lines.length) {
            if (!lines[i].trim()) {
                i++;
                continue;
            }
            const start = i;
            if (/^```/.test(lines[i].trim())) {
                i++;
                while (i < lines.length) {
                    if (/^```/.test(lines[i].trim())) {
                        i++;
                        break;
                    }
                    i++;
                }
            } else {
                i++;
                while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i].trim())) {
                    i++;
                }
            }
            const segment = lines.slice(start, i);
            const keySource = segment.map(stripMarkdownPrefix).find(s => s.length > 0) || segment.join(' ');
            blocks.push({ start, end: i - 1, key: normalizeKey(keySource), occurrence: 0 });
        }
        const counts = new Map();
        for (const block of blocks) {
            const occ = counts.get(block.key) || 0;
            block.occurrence = occ;
            counts.set(block.key, occ + 1);
        }
        return blocks;
    }

    function collectPreviewCandidates() {
        if (!editorEl) return [];
        const nodes = Array.from(editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table'));
        const counts = new Map();
        return nodes.map((el) => {
            const key = normalizeKey(el.textContent || '');
            const occ = counts.get(key) || 0;
            counts.set(key, occ + 1);
            return { el, key, occurrence: occ };
        });
    }

    function getCurrentSourceLineIndex() {
        const totalLines = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
        if (document.activeElement === textarea) {
            const caret = Math.max(0, textarea.selectionStart || 0);
            const line = (textarea.value.slice(0, caret).match(/\n/g) || []).length;
            return Math.max(0, Math.min(totalLines - 1, line));
        }
        const maxScroll = Math.max(1, textarea.scrollHeight - textarea.clientHeight);
        const ratio = Math.max(0, Math.min(1, textarea.scrollTop / maxScroll));
        return Math.max(0, Math.min(totalLines - 1, Math.round(ratio * (totalLines - 1))));
    }

    function getCurrentPreviewLineIndex() {
        const scrollHost = contentArea || previewContainer || document.documentElement;
        const blocks = extractMarkdownBlocks(textarea.value);
        const candidates = collectPreviewCandidates();
        if (blocks.length > 0 && candidates.length > 0) {
            const hostRect = scrollHost.getBoundingClientRect();
            const centerY = hostRect.top + hostRect.height / 2;
            let hit = null;
            let minDist = Number.POSITIVE_INFINITY;
            for (const cand of candidates) {
                const rect = cand.el.getBoundingClientRect();
                const visible = rect.bottom >= hostRect.top && rect.top <= hostRect.bottom;
                if (!visible) continue;
                const nodeCenter = rect.top + rect.height / 2;
                const dist = Math.abs(nodeCenter - centerY);
                if (dist < minDist) {
                    minDist = dist;
                    hit = cand;
                }
            }
            if (hit) {
                const exact = blocks.find(b => b.key === hit.key && b.occurrence === hit.occurrence);
                const fallback = blocks.find(b => b.key === hit.key);
                if (exact) return exact.start;
                if (fallback) return fallback.start;
            }
        }
        const totalLines = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
        const maxScroll = Math.max(1, scrollHost.scrollHeight - scrollHost.clientHeight);
        const ratio = Math.max(0, Math.min(1, scrollHost.scrollTop / maxScroll));
        return Math.max(0, Math.min(totalLines - 1, Math.round(ratio * (totalLines - 1))));
    }

    function scrollPreviewToLine(lineIdx, options) {
        const immediate = options && options.immediate === true;
        const scrollHost = contentArea || previewContainer || document.documentElement;
        const blocks = extractMarkdownBlocks(textarea.value);
        const candidates = collectPreviewCandidates();
        const block = blocks.find(b => lineIdx >= b.start && lineIdx <= b.end) || blocks.find(b => b.start >= lineIdx) || blocks[blocks.length - 1];
        let target = null;
        if (block && candidates.length > 0) {
            target = candidates.find(c => c.key === block.key && c.occurrence === block.occurrence)?.el
                || candidates.find(c => c.key === block.key)?.el
                || null;
        }
        if (target) {
            target.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth', block: 'center' });
            if (!immediate) {
                target.style.backgroundColor = 'rgba(125, 90, 255, 0.1)';
                setTimeout(() => { target.style.backgroundColor = ''; }, 1200);
            }
            return;
        }
        const totalLines = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
        const ratio = totalLines <= 1 ? 0 : lineIdx / (totalLines - 1);
        const maxScroll = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight);
        scrollHost.scrollTop = Math.round(maxScroll * ratio);
    }

    tabSource.addEventListener('click', switchToSource);
    tabVisual.addEventListener('click', switchToVisual);

    function handlePreviewLinkClick(e) {
        if (!vscode) return;
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        var href = (a.getAttribute('href') || '').trim();
        if (!href) return;
        if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return;
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ command: 'openLink', href: href });
    }
    if (contentArea) contentArea.addEventListener('click', handlePreviewLinkClick, true);

    document.addEventListener('keydown', function (e) {
        const key = (e.key || '').toLowerCase();
        if ((e.metaKey || e.ctrlKey) && !e.altKey && key === 'f') {
            e.preventDefault();
            e.stopPropagation();
            openFindBar();
        }
    }, true);

    const debouncedUpdate = debounce((markdown) => {
        vscode.postMessage({ command: 'editorUpdate', content: markdown });
    }, 300);

    textarea.addEventListener('input', function () {
        updateSourceLineNumbers();
        if (findBar && findBar.style.display !== 'none') {
            refreshFindMatches(true);
        }
        debouncedUpdate(textarea.value);
    });
    textarea.addEventListener('scroll', syncLineNumbersScroll);

    // 划词 Add to Chat（仅源码模式）
    const selectionToolbar = document.getElementById('cora-selection-toolbar');
    const addToChatBtn = document.getElementById('cora-add-to-chat-btn');

    function getSelectedText() {
        const start = textarea.selectionStart, end = textarea.selectionEnd;
        return start !== end ? textarea.value.substring(start, end) : '';
    }

    function getSelectionLineRange() {
        const v = textarea.value;
        const start = textarea.selectionStart, end = textarea.selectionEnd;
        const startLine = (v.substring(0, start).match(/\n/g) || []).length + 1;
        const endLine = (v.substring(0, end).match(/\n/g) || []).length + 1;
        return { startLine, endLine };
    }

    function showSelectionToolbar() {
        if (getSelectedText()) {
            selectionToolbar.classList.add('visible');
            selectionToolbar.setAttribute('aria-hidden', 'false');
        }
    }

    function hideSelectionToolbar() {
        if (selectionToolbar) {
            selectionToolbar.classList.remove('visible');
            selectionToolbar.setAttribute('aria-hidden', 'true');
        }
    }

    textarea.addEventListener('mouseup', function () {
        if (isSourceMode) {
            if (getSelectedText()) showSelectionToolbar();
            else hideSelectionToolbar();
        }
    });
    textarea.addEventListener('keyup', function (e) {
        if (isSourceMode && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Shift')) {
            if (getSelectedText()) showSelectionToolbar();
            else hideSelectionToolbar();
        }
    });

    addToChatBtn.addEventListener('click', function () {
        const text = getSelectedText();
        if (!text) return;
        const { startLine, endLine } = getSelectionLineRange();
        vscode.postMessage({ command: 'addToChat', startLine, endLine, text });
        hideSelectionToolbar();
    });

    sourceContainer.addEventListener('mousedown', function (e) {
        if (selectionToolbar && !selectionToolbar.contains(e.target) && e.target !== textarea) {
            hideSelectionToolbar();
        }
    });

    var mermaidReady = false;

    function createMermaidModal() {
        var i18n = window.__CORA_I18N__ || {};
        var zoomInLabel = i18n.mermaidZoomIn || 'Zoom in';
        var zoomOutLabel = i18n.mermaidZoomOut || 'Zoom out';
        var closeLabel = i18n.mermaidClose || 'Close';
        var scale = 1;
        var minScale = 0.25;
        var maxScale = 12;
        var step = 0.25;

        var overlay = document.createElement('div');
        overlay.className = 'cora-mermaid-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;';
        overlay.setAttribute('aria-hidden', 'true');

        var panel = document.createElement('div');
        panel.style.cssText = 'background:var(--vscode-editor-background,#fff);border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.2);min-width:80vw;min-height:80vh;max-width:95vw;max-height:90vh;width:90vw;height:85vh;display:flex;flex-direction:column;overflow:hidden;';
        overlay.appendChild(panel);

        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--vscode-widget-border,rgba(0,0,0,0.1));flex-shrink:0;';
        function mkBtn(text) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = 'padding:4px 10px;border:1px solid var(--vscode-widget-border);border-radius:4px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:12px;';
            return b;
        }
        var btnZoomIn = mkBtn(zoomInLabel);
        var btnZoomOut = mkBtn(zoomOutLabel);
        var btnClose = mkBtn(closeLabel);
        toolbar.appendChild(btnZoomOut);
        toolbar.appendChild(btnZoomIn);
        toolbar.appendChild(btnClose);
        panel.appendChild(toolbar);

        var scrollWrap = document.createElement('div');
        scrollWrap.style.cssText = 'flex:1;overflow:auto;padding:16px;display:flex;align-items:center;justify-content:center;min-height:120px;';
        panel.appendChild(scrollWrap);

        var svgWrap = document.createElement('div');
        svgWrap.style.cssText = 'display:inline-block;transform-origin:center center;transition:transform 0.15s ease;';
        scrollWrap.appendChild(svgWrap);

        function setScale(s) {
            scale = Math.max(minScale, Math.min(maxScale, s));
            svgWrap.style.transform = 'scale(' + scale + ')';
        }
        btnZoomIn.addEventListener('click', function () { setScale(scale + step); });
        btnZoomOut.addEventListener('click', function () { setScale(scale - step); });
        scrollWrap.addEventListener('wheel', function (e) {
            e.preventDefault();
            setScale(scale + (e.deltaY > 0 ? -step : step));
        }, { passive: false });
        btnClose.addEventListener('click', hide);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) hide();
        });
        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') {
                hide();
                document.removeEventListener('keydown', onKey);
            }
        });

        function show(svgSource) {
            if (!svgSource || !svgSource.cloneNode) return;
            var clone = svgSource.cloneNode(true);
            var contentGroup = clone.querySelector('g');
            if (contentGroup && typeof contentGroup.getBBox === 'function') {
                try {
                    var b = contentGroup.getBBox();
                    if (b.width > 0 && b.height > 0) {
                        var pad = 24;
                        clone.setAttribute('viewBox', (b.x - pad) + ' ' + (b.y - pad) + ' ' + (b.width + pad * 2) + ' ' + (b.height + pad * 2));
                        clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    }
                } catch {
                    // ignore bbox errors
                }
            }
            svgWrap.innerHTML = '';
            svgWrap.appendChild(clone);
            scale = 1;
            svgWrap.style.transform = 'scale(1)';
            overlay.style.display = 'flex';
            overlay.setAttribute('aria-hidden', 'false');
            function applyFitScale() {
                var svgEl = svgWrap.querySelector('svg');
                if (!svgEl) return;
                var w = scrollWrap.clientWidth - 32;
                var h = scrollWrap.clientHeight - 32;
                if (w <= 0 || h <= 0) return;
                var rect = svgEl.getBoundingClientRect();
                var rw = rect.width;
                var rh = rect.height;
                if (rw <= 0 || rh <= 0) return;
                var fitScale = Math.min(w / rw, h / rh) * 0.9;
                setScale(Math.max(minScale, Math.min(maxScale, fitScale)));
            }
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    applyFitScale();
                });
            });
            setTimeout(applyFitScale, 80);
        }
        function hide() {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }
        document.body.appendChild(overlay);
        return { show: show, hide: hide };
    }

    var mermaidModal = null;
    function showMermaidModal(svgEl) {
        if (!svgEl || svgEl.tagName !== 'svg') return;
        if (!mermaidModal) mermaidModal = createMermaidModal();
        mermaidModal.show(svgEl);
    }

    function renderMermaidBlocks(container) {
        if (!container) return;
        var codes = container.querySelectorAll('pre code[class*="mermaid"]');
        if (codes.length === 0) return;
        var mermaidUrl = window.__CORA_MERMAID__;
        if (!mermaidUrl) return;

        (function run() {
            if (window.mermaid) {
                window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
                codes.forEach(function (codeEl, i) {
                    var pre = codeEl.closest('pre');
                    if (!pre) return;
                    var code = (codeEl.textContent || '').trim();
                    if (!code) return;
                    var id = 'mermaid-marked-' + i + '-' + Math.random().toString(36).substring(2, 9);
                    window.mermaid.render(id, code).then(function (result) {
                        var wrap = document.createElement('div');
                        wrap.className = 'cora-mermaid-view-container';
                        wrap.style.margin = '16px 0';
                        wrap.style.cursor = 'pointer';
                        wrap.innerHTML = result.svg;
                        if (pre.parentNode) pre.parentNode.replaceChild(wrap, pre);
                        var svgEl = wrap.querySelector('svg');
                        if (svgEl) {
                            wrap.addEventListener('click', function () { showMermaidModal(svgEl); });
                        }
                    }).catch(function (err) {
                        if (pre.parentNode) {
                            var errLabel = (err && err.message) ? err.message : ((window.__CORA_I18N__ && window.__CORA_I18N__.mermaidError) ? window.__CORA_I18N__.mermaidError : 'Mermaid error');
                        pre.innerHTML = '<code style="color:red;font-size:12px;">' + errLabel + '</code>';
                        }
                    });
                });
                return;
            }
            if (!mermaidReady) {
                mermaidReady = true;
                loadScript(mermaidUrl).then(function (ok) {
                    if (ok && window.mermaid) {
                        run();
                    } else {
                        var hintText = (window.__CORA_I18N__ && window.__CORA_I18N__.mermaidLoadFailed) ? window.__CORA_I18N__.mermaidLoadFailed : 'Chart engine failed to load, above is Mermaid source.';
                        codes.forEach(function (codeEl) {
                            var pre = codeEl.closest('pre');
                            if (!pre || !pre.parentNode) return;
                            var hint = document.createElement('p');
                            hint.style.cssText = 'font-size:12px; color:var(--vscode-descriptionForeground,#6e7681); margin:4px 0 12px 0;';
                            hint.textContent = hintText;
                            if (pre.nextSibling) pre.parentNode.insertBefore(hint, pre.nextSibling);
                            else pre.parentNode.appendChild(hint);
                        });
                    }
                });
            }
        })();
    }

    // 初始化内容
    textarea.value = initialContent;
    updateSourceLineNumbers();
    if (editorEl) {
        editorEl.innerHTML = initialRendered;
        renderMermaidBlocks(editorEl);
    }

    // 监听宿主消息
    window.addEventListener('message', function (event) {
        const message = event.data;
        if (message.command === 'updateContent') {
            const content = message.content;
            if (typeof content === 'string') {
                textarea.value = content;
                updateSourceLineNumbers();
            }
            if (typeof message.renderedHtml === 'string' && editorEl) {
                editorEl.innerHTML = message.renderedHtml;
                renderMermaidBlocks(editorEl);
            }
            if (findBar && findBar.style.display !== 'none') {
                refreshFindMatches(true);
            }
            debug('收到热更新内容');
            return;
        }
        if (message.command === 'openLocalFind') {
            openFindBar();
            return;
        }
        if (message.command === 'scrollToLine') {
            const line = Math.max(0, Number(message.line) || 0);
            debug('跳转到行: ' + line);
            if (!isSourceMode) {
                scrollPreviewToLine(line);
                return;
            }
            placeSourceCursorToLine(line);
        }
    });

    debug('Marked 只读模式就绪');
    vscode.postMessage({ command: 'ready' });
})();
