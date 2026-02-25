/**
 * Cora Typora-style Editor Bridge (Offline Edition)
 * V2: Native NodeView Integration for Mermaid
 */

const debug = (msg) => {
    console.log('[Cora] ' + msg);
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

// 缓存已生成的 SVG，避免编辑时的闪烁
const svgCache = new Map();

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
        tabVisual = document.getElementById('tab-visual');
        tabSource = document.getElementById('tab-source');

        window.switchToSource = () => {
            if (isSourceMode) return;
            isSourceMode = true;
            textarea.value = currentMarkdown;
            visualContainer.style.display = 'none';
            sourceContainer.style.display = 'block';
            tabVisual.classList.remove('active');
            tabSource.classList.add('active');
            debug('切换至源码模式');
        };

        window.switchToVisual = () => {
            if (!isSourceMode) return;
            isSourceMode = false;
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

        textarea.addEventListener('input', (e) => {
            currentMarkdown = e.target.value;
            vscode.postMessage({ command: 'editorUpdate', content: currentMarkdown });
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
                        svgCache.set(hash, svg);
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

                // 核心：拦截 Mermaid 节点的渲染
                ctx.update(editorViewOptionsCtx, (prev) => ({
                    ...prev,
                    nodeViews: {
                        ...prev.nodeViews,
                        // Milkdown 的代码块节点名可能因插件而异，gfm/commonmark 通常是 code_block
                        code_block: (node, view, getPos) => {
                            if (node.attrs.language === 'mermaid') {
                                return createMermaidView(node);
                            }
                            // 其他代码块使用默认渲染 (Prism 会接管)
                            return null;
                        },
                        fence: (node, view, getPos) => {
                            if (node.attrs.language === 'mermaid') {
                                return createMermaidView(node);
                            }
                            return null;
                        }
                    }
                }));

                ctx.get(listenerCtx).markdownUpdated((_, markdown, prev) => {
                    if (markdown !== prev) {
                        currentMarkdown = markdown;
                        vscode.postMessage({ command: 'editorUpdate', content: markdown });
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

        // 监听来自宿主的跳转指令
        window.addEventListener('message', event => {
            const message = event.data;
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
