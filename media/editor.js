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

        function updateSourceLineNumbers() {
            const lineCount = Math.max(1, (textarea.value.match(/\n/g) || []).length + 1);
            lineNumbersEl.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
        }
        function syncLineNumbersScroll() {
            lineNumbersEl.scrollTop = textarea.scrollTop;
        }

        const switchToSource = () => {
            if (isSourceMode) return;
            isSourceMode = true;
            textarea.value = currentMarkdown;
            updateSourceLineNumbers();
            visualContainer.style.display = 'none';
            sourceContainer.style.display = 'block';
            tabVisual.classList.remove('active');
            tabSource.classList.add('active');
            debug('切换至源码模式');
        };

        const switchToVisual = () => {
            if (!isSourceMode) return;
            isSourceMode = false;
            hideSelectionToolbar();
            currentMarkdown = textarea.value;
            if (window.editor) {
                window.editor.action(replaceAll(currentMarkdown));
            }
            sourceContainer.style.display = 'none';
            visualContainer.style.display = 'block';
            tabSource.classList.remove('active');
            tabVisual.classList.add('active');
            debug('切换至预览模式');
        };

        tabSource.addEventListener('click', switchToSource);
        tabVisual.addEventListener('click', switchToVisual);

        const debouncedSourceUpdate = debounce((markdown) => {
            vscode.postMessage({ command: 'editorUpdate', content: markdown });
        }, 300);

        textarea.addEventListener('input', (e) => {
            currentMarkdown = e.target.value;
            updateSourceLineNumbers();
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
                        container.innerHTML = `<pre style="color:red; font-size:12px;">图表语法错误: ${e.message}</pre>`;
                    }
                } else {
                    container.innerHTML = '<pre>正在加载图表引擎...</pre>';
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
                return;
            }

            if (message.command === 'scrollToLine') {
                const line = message.line;
                debug(`跳转到行: ${line}`);

                if (isSourceMode) {
                    // 源码模式：简单滚动 Textarea
                    const lines = textarea.value.split('\n');
                    const totalLines = lines.length;
                    const charPos = lines.slice(0, line).join('\n').length;

                    textarea.focus();
                    textarea.setSelectionRange(charPos, charPos);

                    const lineHeight = textarea.scrollHeight / totalLines;
                    textarea.scrollTop = lineHeight * line - 100;
                } else {
                    // 预览模式：利用 Prosemirror 的 domAtPos 或直接寻找近似元素
                    // 这是一个简化的实现：寻找编辑器内的第 N 个直接子节点进行滚动
                    try {
                        const editorDom = editorElement.querySelector('.milkdown .editor');
                        if (editorDom && editorDom.children.length > 0) {
                            // 尝试找到最接近的一个块级元素
                            // 注意：Markdown 行号与 DOM 节点并不完全 1:1，这里使用预览时的近似定位
                            const targetIdx = Math.min(line, editorDom.children.length - 1);
                            const targetEl = editorDom.children[targetIdx];
                            if (targetEl) {
                                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // 简单的视觉高亮反馈
                                targetEl.style.backgroundColor = 'rgba(125, 90, 255, 0.1)';
                                setTimeout(() => targetEl.style.backgroundColor = '', 2000);
                            }
                        }
                    } catch (e) {
                        console.error('Scroll failed:', e);
                    }
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
