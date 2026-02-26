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

    function switchToSource() {
        if (isSourceMode) return;
        isSourceMode = true;
        previewContainer.style.display = 'none';
        sourceContainer.style.display = 'block';
        tabVisual.classList.remove('active');
        tabSource.classList.add('active');
        hideSelectionToolbar();
        debug('切换至 Markdown 源码');
    }

    function switchToVisual() {
        if (!isSourceMode) return;
        isSourceMode = false;
        sourceContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        tabSource.classList.remove('active');
        tabVisual.classList.add('active');
        hideSelectionToolbar();
        debug('切换至预览');
    }

    tabSource.addEventListener('click', switchToSource);
    tabVisual.addEventListener('click', switchToVisual);

    const debouncedUpdate = debounce((markdown) => {
        vscode.postMessage({ command: 'editorUpdate', content: markdown });
    }, 300);

    textarea.addEventListener('input', function () {
        updateSourceLineNumbers();
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
                        wrap.innerHTML = result.svg;
                        if (pre.parentNode) pre.parentNode.replaceChild(wrap, pre);
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
                    if (ok && window.mermaid) run();
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
            debug('收到热更新内容');
            return;
        }
        if (message.command === 'scrollToLine') {
            const line = message.line;
            debug('跳转到行: ' + line);
            const lines = textarea.value.split('\n');
            const totalLines = lines.length;
            const charPos = lines.slice(0, line).join('\n').length;
            textarea.focus();
            textarea.setSelectionRange(charPos, charPos);
            const lineHeight = textarea.scrollHeight / totalLines;
            textarea.scrollTop = Math.max(0, lineHeight * line - 100);
        }
    });

    debug('Marked 只读模式就绪');
    vscode.postMessage({ command: 'ready' });
})();
