import * as vscode from 'vscode';
import * as fs from 'fs';
import { marked } from 'marked';

/**
 * 自定义 Markdown 预览提供者
 * 使用 Webview 实现预览功能，而非 VS Code 原生预览
 */
export class PreviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * 打开预览面板（每次调用都切到 Preview 模式，不关心之前是否在编辑或其他文件）
     */
    async openPreview(uri: vscode.Uri): Promise<void> {
        this.currentUri = uri;
        const fileName = uri.path.split('/').pop() || 'Preview';

        // 如果面板已存在，一律更新为当前文件并前置显示
        if (this.panel) {
            this.panel.title = `${fileName} (Preview)`;
            await this.updatePreview();
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // 创建新的 Webview 面板
        this.panel = vscode.window.createWebviewPanel(
            'coraPreview',
            `${fileName} (Preview)`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );

        // 监听面板关闭
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 监听 webview 消息：全部在自有 webview 内切换，不调用 VS Code 编辑器
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (!this.panel || !this.currentUri) return;
            if (msg.command === 'openMarkdown') {
                try {
                    const content = await fs.promises.readFile(this.currentUri.fsPath, 'utf8');
                    this.panel.webview.html = this.generateMarkdownEditorHtml(content, this.panel.webview);
                } catch (e) {
                    console.error(e);
                }
            } else if (msg.command === 'saveAndPreview' && typeof msg.content === 'string') {
                try {
                    await vscode.workspace.fs.writeFile(
                        this.currentUri,
                        new TextEncoder().encode(msg.content)
                    );
                    await this.updatePreview();
                } catch (e) {
                    console.error(e);
                    this.panel.webview.html = this.getErrorHtml('保存失败');
                }
            }
        });

        // 初始加载内容
        await this.updatePreview();
    }

    /**
     * 更新预览内容
     */
    async updatePreview(): Promise<void> {
        if (!this.panel || !this.currentUri) {
            return;
        }

        try {
            const content = await fs.promises.readFile(this.currentUri.fsPath, 'utf8');
            const html = this.generateHtml(content, this.currentUri, this.panel.webview);
            this.panel.webview.html = html;
        } catch (error) {
            console.error('Error reading file for preview:', error);
            this.panel.webview.html = this.getErrorHtml('无法读取文件内容');
        }
    }

    /**
     * 获取当前预览的 URI
     */
    getCurrentUri(): vscode.Uri | undefined {
        return this.currentUri;
    }

    /**
     * 检查是否有打开的预览面板
     */
    hasOpenPanel(): boolean {
        return this.panel !== undefined;
    }

    /**
     * 关闭预览面板
     */
    closePreview(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }

    /**
     * 生成预览 HTML（含 Mermaid 渲染）
     */
    private generateHtml(markdown: string, uri: vscode.Uri, webview: vscode.Webview): string {
        // 配置 marked
        marked.setOptions({
            gfm: true,
            breaks: true
        });

        // 转换 Markdown 为 HTML
        const htmlContent = marked.parse(markdown);

        const mermaidScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid.min.js')
        );

        // 生成完整 HTML 页面；CSP 允许本地脚本与 Mermaid 内联 SVG
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' vscode-resource:; script-src 'unsafe-inline' vscode-resource:; img-src data: https:;">
    <title>Preview</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: var(--vscode-foreground, #333);
            background: var(--vscode-editor-background, #fff);
            margin: 0;
            padding: 0;
        }
        .cora-toolbar-wrap {
            padding: 12px 16px 8px;
            display: flex;
            justify-content: flex-end;
        }
        .cora-content {
            padding: 0 32px 24px;
            max-width: 860px;
            margin: 0 auto;
        }

        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            color: var(--vscode-foreground, #24292e);
        }

        h1 {
            font-size: 2em;
            border-bottom: 1px solid var(--vscode-panel-border, #eaecef);
            padding-bottom: 0.3em;
        }

        h2 {
            font-size: 1.5em;
            border-bottom: 1px solid var(--vscode-panel-border, #eaecef);
            padding-bottom: 0.3em;
        }

        h3 {
            font-size: 1.25em;
        }

        h4 {
            font-size: 1em;
        }

        p {
            margin-bottom: 16px;
        }

        a {
            color: var(--vscode-textLink-foreground, #0366d6);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        ul, ol {
            margin-bottom: 16px;
            padding-left: 2em;
        }

        li {
            margin-bottom: 0.25em;
        }

        code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: var(--vscode-textCodeBlock-background, rgba(27, 31, 35, 0.05));
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }

        pre {
            margin-bottom: 16px;
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: var(--vscode-textCodeBlock-background, #f6f8fa);
            border-radius: 6px;
        }

        pre code {
            padding: 0;
            background-color: transparent;
        }

        blockquote {
            margin-bottom: 16px;
            padding: 0 1em;
            color: var(--vscode-descriptionForeground, #6a737d);
            border-left: 0.25em solid var(--vscode-panel-border, #dfe2e5);
        }

        img {
            max-width: 100%;
            box-sizing: content-box;
        }

        table {
            display: block;
            width: 100%;
            overflow: auto;
            margin-bottom: 16px;
            border-collapse: collapse;
        }

        th, td {
            padding: 6px 13px;
            border: 1px solid var(--vscode-panel-border, #dfe2e5);
        }

        th {
            font-weight: 600;
            background-color: var(--vscode-editor-background, #fff);
        }

        tr:nth-child(2n) {
            background-color: var(--vscode-list-hoverBackground, #f6f8fa);
        }

        hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: var(--vscode-panel-border, #e1e4e8);
            border: 0;
        }

        .task-list-item {
            list-style-type: none;
        }

        .task-list-item input {
            margin-right: 0.5em;
        }

        .mermaid {
            margin: 16px 0;
            text-align: center;
        }
        .mermaid svg {
            max-width: 100%;
            height: auto;
        }

        .preview-toolbar {
            display: flex;
            align-items: center;
            gap: 0;
            border: 1px solid var(--vscode-panel-border, #e1e4e8);
            border-radius: 3px;
            width: fit-content;
            overflow: hidden;
        }
        .preview-toolbar button {
            margin: 0;
            padding: 2px 10px;
            font-size: 12px;
            line-height: 1.4;
            border: none;
            background: var(--vscode-editor-inactiveSelectionBackground, transparent);
            color: var(--vscode-foreground, #333);
            cursor: pointer;
            font-family: inherit;
        }
        .preview-toolbar button:hover {
            background: var(--vscode-list-hoverBackground, #f0f0f0);
        }
        .preview-toolbar button.active {
            background: var(--vscode-button-background, #007acc);
            color: var(--vscode-button-foreground, #fff);
        }
        .preview-toolbar button:not(:last-child) {
            border-right: 1px solid var(--vscode-panel-border, #e1e4e8);
        }
    </style>
</head>
<body>
    <div class="cora-toolbar-wrap">
        <div class="preview-toolbar">
            <button type="button" class="active" aria-pressed="true">预览</button>
            <button type="button" id="btn-markdown" aria-pressed="false">编辑</button>
        </div>
    </div>
    <div class="cora-content">
    ${htmlContent}
    </div>
    <script src="${mermaidScriptUri}"></script>
    <script>
        (function() {
            if (typeof mermaid === 'undefined') return;
            mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
            var blocks = document.querySelectorAll('pre code.language-mermaid');
            if (blocks.length === 0) return;
            blocks.forEach(function(block) {
                var pre = block.closest('pre');
                var div = document.createElement('div');
                div.className = 'mermaid';
                div.textContent = block.textContent;
                pre.parentNode.replaceChild(div, pre);
            });
            mermaid.run({ querySelector: '.mermaid', suppressErrors: true }).catch(function(e) { console.error(e); });
        })();
        (function() {
            var btn = document.getElementById('btn-markdown');
            if (btn && typeof acquireVsCodeApi !== 'undefined') {
                var vscode = acquireVsCodeApi();
                btn.addEventListener('click', function() { vscode.postMessage({ command: 'openMarkdown' }); });
            }
        })();
    </script>
</body>
</html>`;
    }

    /**
     * 生成 Markdown 源码编辑视图（自有实现，不依赖 VS Code 编辑器）
     */
    private generateMarkdownEditorHtml(markdown: string, _webview: vscode.Webview): string {
        const contentJson = JSON.stringify(markdown).replace(/<\/script>/gi, '\\u003c/script>');
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>编辑</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            color: var(--vscode-foreground, #333);
            background: var(--vscode-editor-background, #fff);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .cora-toolbar-wrap {
            padding: 12px 16px 8px;
            display: flex;
            justify-content: flex-end;
        }
        .preview-toolbar {
            display: flex;
            gap: 0;
            border: 1px solid var(--vscode-panel-border, #e1e4e8);
            border-radius: 3px;
            width: fit-content;
            overflow: hidden;
        }
        .preview-toolbar button {
            margin: 0;
            padding: 2px 10px;
            font-size: 12px;
            line-height: 1.4;
            border: none;
            background: var(--vscode-editor-inactiveSelectionBackground, transparent);
            color: var(--vscode-foreground, #333);
            cursor: pointer;
            font-family: inherit;
        }
        .preview-toolbar button:hover {
            background: var(--vscode-list-hoverBackground, #f0f0f0);
        }
        .preview-toolbar button.active {
            background: var(--vscode-button-background, #007acc);
            color: var(--vscode-button-foreground, #fff);
        }
        .preview-toolbar button:not(:last-child) {
            border-right: 1px solid var(--vscode-panel-border, #e1e4e8);
        }
        .cora-content {
            flex: 1;
            padding: 0;
            max-width: none;
            margin: 0;
            width: 100%;
            min-height: 0;
        }
        .cora-editor-area {
            display: flex;
            width: 100%;
            height: 100%;
            min-height: 300px;
            border: none;
            border-top: 1px solid var(--vscode-panel-border, #e1e4e8);
            border-radius: 0;
            overflow: hidden;
        }
        .cora-editor-line-numbers {
            width: 3em;
            flex-shrink: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 12px 8px 12px 12px;
            scrollbar-width: none;
        }
        .cora-editor-line-numbers::-webkit-scrollbar {
            display: none;
        }
        .cora-editor-line-numbers {
            font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 13px;
            line-height: 1.5;
            text-align: right;
            color: var(--vscode-descriptionForeground, #6a737d);
            opacity: 0.65;
            user-select: none;
            background: var(--vscode-editor-background, #fff);
        }
        #line-numbers-inner {
            min-height: 100%;
        }
        .cora-editor-wrap {
            flex: 1;
            min-width: 0;
            position: relative;
        }
        #md-editor {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            padding: 12px 16px 12px 12px;
            font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 13px;
            line-height: 1.5;
            color: var(--vscode-editor-foreground, #333);
            background: var(--vscode-editor-background, #fff);
            border: none;
            resize: none;
            tab-size: 4;
        }
        #md-editor:focus {
            outline: none;
        }
    </style>
</head>
<body>
    <div class="cora-toolbar-wrap">
        <div class="preview-toolbar">
            <button type="button" id="btn-preview" aria-pressed="false">预览</button>
            <button type="button" class="active" aria-pressed="true">编辑</button>
        </div>
    </div>
    <div class="cora-content">
        <div class="cora-editor-area">
            <div class="cora-editor-line-numbers" id="line-numbers"><div id="line-numbers-inner">1</div></div>
            <div class="cora-editor-wrap">
                <textarea id="md-editor" spellcheck="false" placeholder="Markdown 源码…"></textarea>
            </div>
        </div>
    </div>
    <script type="application/json" id="initial-content">${contentJson}</script>
    <script>
        (function() {
            var el = document.getElementById('initial-content');
            var ta = document.getElementById('md-editor');
            var ln = document.getElementById('line-numbers');
            var lnInner = document.getElementById('line-numbers-inner');
            if (el && ta) {
                try { ta.value = JSON.parse(el.textContent); } catch (e) {}
            }
            function countLines(str) {
                if (!str) return 1;
                var n = 1;
                for (var i = 0; i < str.length; i++) { if (str.charAt(i) === '\\n') n++; }
                return n;
            }
            function updateLineNumbers() {
                var n = countLines(ta ? ta.value : '');
                var s = '';
                for (var i = 1; i <= n; i++) { s += i + '\\n'; }
                if (lnInner) lnInner.textContent = s || '1';
            }
            updateLineNumbers();
            if (ta) {
                ta.addEventListener('input', updateLineNumbers);
                ta.addEventListener('scroll', function() { if (ln) ln.scrollTop = ta.scrollTop; });
            }
            var btn = document.getElementById('btn-preview');
            if (btn && typeof acquireVsCodeApi !== 'undefined') {
                var vscode = acquireVsCodeApi();
                btn.addEventListener('click', function() {
                    vscode.postMessage({ command: 'saveAndPreview', content: ta ? ta.value : '' });
                });
            }
        })();
    </script>
</body>
</html>`;
    }

    /**
     * 错误页面 HTML
     */
    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Preview Error</title>
    <style>
        body {
            font-family: sans-serif;
            padding: 40px;
            text-align: center;
            color: var(--vscode-foreground, #333);
        }
    </style>
</head>
<body>
    <h2>⚠️ ${message}</h2>
</body>
</html>`;
    }
}
