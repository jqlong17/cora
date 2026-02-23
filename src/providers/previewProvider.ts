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
     * 打开预览面板
     */
    async openPreview(uri: vscode.Uri): Promise<void> {
        this.currentUri = uri;

        // 如果面板已存在，更新内容
        if (this.panel) {
            await this.updatePreview();
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // 创建新的 Webview 面板
        const fileName = uri.path.split('/').pop() || 'Preview';
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
            const html = this.generateHtml(content, this.currentUri);
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
     * 生成预览 HTML
     */
    private generateHtml(markdown: string, uri: vscode.Uri): string {
        // 配置 marked
        marked.setOptions({
            gfm: true,
            breaks: true
        });

        // 转换 Markdown 为 HTML
        const htmlContent = marked.parse(markdown);

        // 生成完整 HTML 页面
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
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
            padding: 24px 32px;
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
    </style>
</head>
<body>
    ${htmlContent}
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
