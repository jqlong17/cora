/**
 * Cora Typora-style Editor Bridge (Offline Edition)
 * V2: Native NodeView Integration for Mermaid
 */

const debug = (msg) => {
    console.log('[Cora] ' + msg);
};

// Prism 不含 mermaid 语法定义，mermaid 块由 NodeView 独立渲染，静默跳过即可
const _origWarn = console.warn;
console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Unsupported language detected')) return;
    _origWarn.apply(console, args);
};

function loadScript(url) {
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = () => resolve(true);
        s.onerror = () => {
            debug('Mermaid 加载失败');
            resolve(false);
        };
        document.head.appendChild(s);
    });
}

// 缓存已生成的 SVG，加入简单的上限管理防止内存泄漏
const svgCache = new Map();
const MAX_CACHE_SIZE = 50;

function addToCache(hash, svg) {
    if (svgCache.size >= MAX_CACHE_SIZE) {
        const firstKey = svgCache.keys().next().value;
        svgCache.delete(firstKey);
    }
    svgCache.set(hash, svg);
}

// 防抖函数
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Mermaid 弹窗：放大/缩小
let mermaidModalInstance = null;
function createMermaidModal() {
    const i18n = window.__CORA_I18N__ || {};
    const zoomInLabel = i18n.mermaidZoomIn || 'Zoom in';
    const zoomOutLabel = i18n.mermaidZoomOut || 'Zoom out';
    const closeLabel = i18n.mermaidClose || 'Close';
    let scale = 1;
    const minScale = 0.25;
    const maxScale = 12;
    const step = 0.25;

    const overlay = document.createElement('div');
    overlay.className = 'cora-mermaid-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;';
    overlay.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('div');
    panel.style.cssText = 'background:var(--vscode-editor-background,#fff);border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.2);min-width:80vw;min-height:80vh;max-width:95vw;max-height:90vh;width:90vw;height:85vh;display:flex;flex-direction:column;overflow:hidden;';
    overlay.appendChild(panel);

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--vscode-widget-border,rgba(0,0,0,0.1));flex-shrink:0;';
    const mkBtn = (text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.style.cssText = 'padding:4px 10px;border:1px solid var(--vscode-widget-border);border-radius:4px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:12px;';
        return b;
    };
    const btnZoomIn = mkBtn(zoomInLabel);
    const btnZoomOut = mkBtn(zoomOutLabel);
    const btnClose = mkBtn(closeLabel);
    toolbar.appendChild(btnZoomOut);
    toolbar.appendChild(btnZoomIn);
    toolbar.appendChild(btnClose);
    panel.appendChild(toolbar);

    const scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = 'flex:1;overflow:auto;padding:16px;display:flex;align-items:center;justify-content:center;min-height:120px;';
    panel.appendChild(scrollWrap);

    const svgWrap = document.createElement('div');
    svgWrap.style.cssText = 'display:inline-block;transform-origin:center center;transition:transform 0.15s ease;';
    scrollWrap.appendChild(svgWrap);

    function setScale(s) {
        scale = Math.max(minScale, Math.min(maxScale, s));
        svgWrap.style.transform = `scale(${scale})`;
    }
    btnZoomIn.addEventListener('click', () => setScale(scale + step));
    btnZoomOut.addEventListener('click', () => setScale(scale - step));
    scrollWrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        setScale(scale + (e.deltaY > 0 ? -step : step));
    }, { passive: false });
    btnClose.addEventListener('click', hide);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { hide(); document.removeEventListener('keydown', onKey); }
    });

    function show(svgSource) {
        if (!svgSource || !svgSource.cloneNode) return;
        const clone = svgSource.cloneNode(true);
        const contentGroup = clone.querySelector('g');
        if (contentGroup && typeof contentGroup.getBBox === 'function') {
            try {
                const b = contentGroup.getBBox();
                if (b.width > 0 && b.height > 0) {
                    const pad = 24;
                    clone.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
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
            const svgEl = svgWrap.querySelector('svg');
            if (!svgEl) return;
            const w = scrollWrap.clientWidth - 32;
            const h = scrollWrap.clientHeight - 32;
            if (w <= 0 || h <= 0) return;
            const rect = svgEl.getBoundingClientRect();
            const rw = rect.width;
            const rh = rect.height;
            if (rw <= 0 || rh <= 0) return;
            const fitScale = Math.min(w / rw, h / rh) * 0.9;
            setScale(Math.max(minScale, Math.min(maxScale, fitScale)));
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
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
    return { show, hide };
}
function showMermaidModal(svgEl) {
    if (!svgEl || svgEl.tagName !== 'svg') return;
    if (!mermaidModalInstance) mermaidModalInstance = createMermaidModal();
    mermaidModalInstance.show(svgEl);
}

async function initEditor() {
    const editorElement = document.querySelector('#editor');
    const vscode = acquireVsCodeApi();
    const bundleUrl = window.__CORA_BUNDLE__;
    const mermaidUrl = window.__CORA_MERMAID__;

    // 暴露全局切换函数
    let currentMarkdown = '';
    let isSourceMode = false;
    let visualContainer, sourceContainer, textarea, tabVisual, tabSource;

    try {
        // 1. 数据准备
        const dataEl = document.getElementById('initial-markdown');
        const initialContent = dataEl ? JSON.parse(dataEl.textContent) : '';
        currentMarkdown = initialContent;

        // 2. 加载 Milkdown
        const milkdown = await import(bundleUrl);
        const { Editor, rootCtx, defaultValueCtx, commonmark, gfm, nord, listener, listenerCtx, prism, editorViewOptionsCtx, replaceAll } = milkdown;

        // 获取 DOM 引用
        visualContainer = document.getElementById('visual-editor-container');
        sourceContainer = document.getElementById('source-editor-container');
        textarea = document.getElementById('source-textarea');
        const lineNumbersEl = document.getElementById('source-line-numbers');
        tabVisual = document.getElementById('tab-visual');
        tabSource = document.getElementById('tab-source');
        const contentArea = document.querySelector('.content-area');

        let findBar = null;
        let findInput = null;
        let findCount = null;
        let findMatches = [];
        let findActiveIdx = -1;
        let previewHitRanges = [];

        function updateSourceLineNumbers() {
            const lineCount = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
            lineNumbersEl.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
        }
        function syncLineNumbersScroll() {
            lineNumbersEl.scrollTop = textarea.scrollTop;
        }
        function normalizeKey(text) {
            return (text || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase()
                .slice(0, 160);
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
            const root = editorElement.querySelector('.milkdown .editor') || editorElement;
            const nodes = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table'));
            const counts = new Map();
            return nodes.map((el) => {
                const key = normalizeKey(el.textContent || '');
                const occ = counts.get(key) || 0;
                counts.set(key, occ + 1);
                return { el, key, occurrence: occ };
            });
        }
        function lineFromCursor() {
            const value = textarea.value || '';
            const caret = Math.max(0, textarea.selectionStart || 0);
            return (value.slice(0, caret).match(/\n/g) || []).length;
        }
        function getCurrentSourceLineIndex() {
            const totalLines = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
            if (document.activeElement === textarea) {
                return Math.max(0, Math.min(totalLines - 1, lineFromCursor()));
            }
            const maxScroll = Math.max(1, textarea.scrollHeight - textarea.clientHeight);
            const ratio = Math.max(0, Math.min(1, textarea.scrollTop / maxScroll));
            return Math.max(0, Math.min(totalLines - 1, Math.round(ratio * (totalLines - 1))));
        }
        function getCurrentPreviewLineIndex() {
            const contentArea = document.querySelector('.content-area');
            const scrollHost = contentArea instanceof HTMLElement ? contentArea : document.documentElement;
            const blocks = extractMarkdownBlocks(currentMarkdown);
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
            const totalLines = Math.max(1, (currentMarkdown.match(/\n/g) || []).length + 1);
            const maxScroll = Math.max(1, scrollHost.scrollHeight - scrollHost.clientHeight);
            const ratio = Math.max(0, Math.min(1, scrollHost.scrollTop / maxScroll));
            return Math.max(0, Math.min(totalLines - 1, Math.round(ratio * (totalLines - 1))));
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
            if (!supportsCustomHighlight()) {
                return;
            }
            try {
                CSS.highlights.delete('cora-find-hit');
                CSS.highlights.delete('cora-find-active');
            } catch {
                // ignore highlight API failures
            }
        }
        function getPreviewRoot() {
            const root = editorElement.querySelector('.milkdown .editor');
            return root || editorElement;
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
            if (!q || isSourceMode || !supportsCustomHighlight()) {
                return;
            }
            const root = getPreviewRoot();
            const lowerQuery = q.toLowerCase();
            const ranges = [];
            for (const node of collectTextNodes(root)) {
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
            if (previewHitRanges.length === 0) {
                return;
            }
            const all = new Highlight(...previewHitRanges);
            CSS.highlights.set('cora-find-hit', all);
        }
        function setActivePreviewHighlight(idx) {
            if (!supportsCustomHighlight()) {
                return;
            }
            try {
                CSS.highlights.delete('cora-find-active');
            } catch {
                // ignore
            }
            if (isSourceMode || previewHitRanges.length === 0 || idx < 0) {
                return;
            }
            const safeIdx = idx % previewHitRanges.length;
            const active = previewHitRanges[safeIdx];
            if (!active) return;
            const h = new Highlight(active);
            CSS.highlights.set('cora-find-active', h);
        }
        function buildFindMatches(query) {
            const q = (query || '').trim().toLowerCase();
            if (!q) return [];
            const text = currentMarkdown || '';
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
            findCount.textContent = `${curr}/${total}`;
        }
        function revealFindMatch(match, immediate = false) {
            if (!match) return;
            if (isSourceMode) {
                textarea.focus();
                textarea.setSelectionRange(match.start, match.end);
                placeSourceCursorToLine(match.line);
                setActivePreviewHighlight(-1);
                return;
            }
            scrollPreviewToLine(match.line, { immediate });
            setActivePreviewHighlight(findActiveIdx);
        }
        function jumpFind(delta, immediate = false) {
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
            revealFindMatch(findMatches[findActiveIdx], immediate);
            updateFindCount();
        }
        function refreshFindMatches(immediate = true) {
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
            revealFindMatch(findMatches[findActiveIdx], immediate);
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

            prevBtn.addEventListener('click', () => jumpFind(-1));
            nextBtn.addEventListener('click', () => jumpFind(1));
            closeBtn.addEventListener('click', () => {
                bar.style.display = 'none';
            });
            input.addEventListener('input', () => {
                findActiveIdx = -1;
                refreshFindMatches(true);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    jumpFind(e.shiftKey ? -1 : 1);
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

            const placeFindBar = () => {
                const rect = contentArea.getBoundingClientRect();
                const top = Math.max(rect.top + 10, 54);
                const right = Math.max(window.innerWidth - rect.right + 12, 12);
                bar.style.top = `${top}px`;
                bar.style.right = `${right}px`;
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
        function scrollPreviewToLine(lineIdx, options = {}) {
            const immediate = options.immediate === true;
            const scrollHost = contentArea instanceof HTMLElement ? contentArea : document.documentElement;
            const blocks = extractMarkdownBlocks(currentMarkdown);
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
            const totalLines = Math.max(1, (currentMarkdown.match(/\n/g) || []).length + 1);
            const ratio = totalLines <= 1 ? 0 : lineIdx / (totalLines - 1);
            const maxScroll = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight);
            scrollHost.scrollTop = Math.round(maxScroll * ratio);
        }

        const switchToSource = () => {
            if (isSourceMode) return;
            const lineIdx = getCurrentPreviewLineIndex();
            isSourceMode = true;
            textarea.value = currentMarkdown;
            updateSourceLineNumbers();
            placeSourceCursorToLine(lineIdx);
            if (findBar && findBar.style.display !== 'none') {
                refreshFindMatches(true);
            }
            visualContainer.style.display = 'none';
            sourceContainer.style.display = 'block';
            tabVisual.classList.remove('active');
            tabSource.classList.add('active');
            debug('切换至源码模式');
        };

        const switchToVisual = () => {
            if (!isSourceMode) return;
            const lineIdx = getCurrentSourceLineIndex();
            isSourceMode = false;
            hideSelectionToolbar();
            currentMarkdown = textarea.value;
            if (window.editor) {
                window.editor.action(replaceAll(currentMarkdown));
            }
            sourceContainer.style.display = 'none';
            visualContainer.style.display = 'block';
            visualContainer.style.visibility = 'hidden';
            tabSource.classList.remove('active');
            tabVisual.classList.add('active');
            setTimeout(() => {
                scrollPreviewToLine(lineIdx, { immediate: true });
                if (findBar && findBar.style.display !== 'none') {
                    refreshFindMatches(true);
                }
                requestAnimationFrame(() => { visualContainer.style.visibility = 'visible'; });
            }, 120);
            debug('切换至预览模式');
        };

        tabSource.addEventListener('click', switchToSource);
        tabVisual.addEventListener('click', switchToVisual);
        if (contentArea) {
            contentArea.addEventListener('click', (e) => {
                const a = e.target?.closest?.('a[href]');
                if (!a) return;
                const href = (a.getAttribute('href') || '').trim();
                if (!href || /^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return;
                e.preventDefault();
                e.stopPropagation();
                vscode.postMessage({ command: 'openLink', href });
            }, true);
        }
        document.addEventListener('keydown', (e) => {
            const key = (e.key || '').toLowerCase();
            if ((e.metaKey || e.ctrlKey) && !e.altKey && key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                openFindBar();
            }
        }, true);

        const debouncedSourceUpdate = debounce((markdown) => {
            vscode.postMessage({ command: 'editorUpdate', content: markdown });
        }, 300);

        textarea.addEventListener('input', (e) => {
            currentMarkdown = e.target.value;
            updateSourceLineNumbers();
            if (findBar && findBar.style.display !== 'none') {
                refreshFindMatches(true);
            }
            debouncedSourceUpdate(currentMarkdown);
        });
        textarea.addEventListener('scroll', syncLineNumbersScroll);

        // 划词浮层：Add to Chat（仅 Markdown 模式）
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
            if (!selectionToolbar) return;
            selectionToolbar.classList.remove('visible');
            selectionToolbar.setAttribute('aria-hidden', 'true');
        }
        textarea.addEventListener('mouseup', () => {
            if (isSourceMode) {
                if (getSelectedText()) showSelectionToolbar();
                else hideSelectionToolbar();
            }
        });
        textarea.addEventListener('keyup', (e) => {
            if (isSourceMode && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Shift')) {
                if (getSelectedText()) showSelectionToolbar();
                else hideSelectionToolbar();
            }
        });
        addToChatBtn.addEventListener('click', () => {
            const text = getSelectedText();
            if (!text) return;
            const { startLine, endLine } = getSelectionLineRange();
            vscode.postMessage({ command: 'addToChat', startLine, endLine, text });
            hideSelectionToolbar();
        });
        sourceContainer.addEventListener('mousedown', (e) => {
            if (!selectionToolbar.contains(e.target) && e.target !== textarea) hideSelectionToolbar();
        });

        // 3. 加载 Mermaid
        let mermaidReady = false;
        if (mermaidUrl) {
            mermaidReady = await loadScript(mermaidUrl);
            if (mermaidReady && window.mermaid) {
                window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
                debug('Mermaid 就绪');
            }
        }

        // 4. 定义 Mermaid NodeView (直接集成在编辑器配置中)
        const createMermaidView = (node) => {
            const container = document.createElement('div');
            container.className = 'cora-mermaid-view-container';
            container.style.cursor = 'pointer';
            container.addEventListener('click', () => {
                const svg = container.querySelector('svg');
                if (svg) showMermaidModal(svg);
            });

            const render = async () => {
                // 如果是源码模式，不执行渲染操作，节省 CPU
                if (isSourceMode) return;

                const code = node.textContent.trim();
                const hash = btoa(unescape(encodeURIComponent(code))).substring(0, 16);

                if (svgCache.has(hash)) {
                    container.innerHTML = svgCache.get(hash);
                    return;
                }

                if (window.mermaid && mermaidReady) {
                    try {
                        const id = 'm' + Math.random().toString(36).substring(2, 9);
                        const { svg } = await window.mermaid.render(id, code);
                        addToCache(hash, svg);
                        container.innerHTML = svg;
                    } catch (e) {
                        const errLabel = (window.__CORA_I18N__ && window.__CORA_I18N__.mermaidError) ? window.__CORA_I18N__.mermaidError : 'Diagram syntax error';
                        container.innerHTML = '<pre style="color:red; font-size:12px;">' + errLabel + ': ' + (e.message || '') + '</pre>';
                    }
                } else {
                    const fallbackHint = (window.__CORA_I18N__ && window.__CORA_I18N__.mermaidEngineFallback) ? window.__CORA_I18N__.mermaidEngineFallback : 'Chart engine not loaded, showing source:';
                    const escaped = String(code).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    container.innerHTML = '<pre style="font-size:12px; color:var(--vscode-descriptionForeground,#6e7681); margin:0 0 6px 0;">' + fallbackHint + '</pre><pre><code>' + escaped + '</code></pre>';
                    if (mermaidUrl) {
                        setTimeout(() => {
                            loadScript(mermaidUrl).then((ok) => {
                                if (ok && window.mermaid) {
                                    window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
                                    mermaidReady = true;
                                    render();
                                }
                            });
                        }, 1500);
                    }
                }
            };

            render();

            return {
                dom: container,
                update: (nextNode) => {
                    if (nextNode.type !== node.type) return false;
                    if (nextNode.textContent !== node.textContent) {
                        // 内容变了，重新渲染
                        node = nextNode;
                        render();
                    }
                    return true;
                }
            };
        };

        // 5. 创建编辑器
        const editor = await Editor.make()
            .config((ctx) => {
                ctx.set(rootCtx, editorElement);
                ctx.set(defaultValueCtx, initialContent);

                // 核心：拦截 Mermaid 节点的渲染（language 兼容大小写，如 mermaid / Mermaid）
                const isMermaid = (lang) => (lang || '').toLowerCase() === 'mermaid';
                ctx.update(editorViewOptionsCtx, (prev) => ({
                    ...prev,
                    nodeViews: {
                        ...prev.nodeViews,
                        code_block: (node, view, getPos) => {
                            if (isMermaid(node.attrs.language)) {
                                return createMermaidView(node);
                            }
                            return null;
                        },
                        fence: (node, view, getPos) => {
                            if (isMermaid(node.attrs.language)) {
                                return createMermaidView(node);
                            }
                            return null;
                        }
                    }
                }));

                const debouncedUpdate = debounce((markdown) => {
                    vscode.postMessage({ command: 'editorUpdate', content: markdown });
                }, 300);

                ctx.get(listenerCtx).markdownUpdated((_, markdown, prev) => {
                    if (markdown !== prev) {
                        currentMarkdown = markdown;
                        debouncedUpdate(markdown);
                    }
                });
            })
            .config(nord)
            .use(commonmark)
            .use(gfm)
            .use(listener)
            .use(prism)
            .create();

        window.editor = editor;

        function applyImageMap(container, imageMap) {
            if (!container || !imageMap || Object.keys(imageMap).length === 0) return;
            const editorDom = container.querySelector && container.querySelector('.milkdown .editor') || container;
            const imgs = editorDom.querySelectorAll ? editorDom.querySelectorAll('img[src]') : [];
            imgs.forEach((img) => {
                const raw = img.getAttribute('src');
                if (raw && imageMap[raw]) {
                    img.src = imageMap[raw];
                }
            });
        }

        const initialImageMap = typeof window.__CORA_IMAGE_MAP__ !== 'undefined' ? window.__CORA_IMAGE_MAP__ : {};
        setTimeout(() => applyImageMap(editorElement, initialImageMap), 100);

        // 监听来自宿主的跳转指令
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateContent') {
                const { content, imageMap } = message;
                currentMarkdown = content;
                debug('收到热更新内容');

                if (isSourceMode) {
                    textarea.value = content;
                    updateSourceLineNumbers();
                } else if (window.editor) {
                    window.editor.action(replaceAll(content));
                    setTimeout(() => applyImageMap(editorElement, imageMap || {}), 50);
                }
                if (findBar && findBar.style.display !== 'none') {
                    refreshFindMatches(true);
                }
                return;
            }

            if (message.command === 'openLocalFind') {
                openFindBar();
                return;
            }

            if (message.command === 'scrollToLine') {
                const line = Math.max(0, Number(message.line) || 0);
                debug(`跳转到行: ${line}`);

                if (isSourceMode) {
                    placeSourceCursorToLine(line);
                } else {
                    scrollPreviewToLine(line);
                }
            }
        });

        debug('编辑器就绪 (双模已激活)');
        vscode.postMessage({ command: 'ready' });

    } catch (err) {
        debug('初始化失败: ' + err.message);
        console.error(err);
    }
}

initEditor().catch(console.error);
