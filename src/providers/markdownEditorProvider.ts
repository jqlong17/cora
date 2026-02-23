import * as vscode from 'vscode';
import { marked } from 'marked';

/**
 * Custom Markdown Editor Provider
 * Provides a built-in Preview/Edit toggle
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'cora.markdownEditor';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MarkdownEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            MarkdownEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        );
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = { enableScripts: true };

        // Default to preview mode
        this.updateWebview(document, webviewPanel, 'preview');

        // Listen for document changes
        const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.updateWebview(document, webviewPanel, 'preview');
            }
        });

        // Listen for messages from webview
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'switchMode') {
                this.updateWebview(document, webviewPanel, message.mode);
            } else if (message.command === 'save') {
                await this.saveDocument(document, message.content);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeSubscription.dispose();
        });
    }

    private updateWebview(
        document: vscode.TextDocument,
        panel: vscode.WebviewPanel,
        mode: 'edit' | 'preview'
    ): void {
        const content = document.getText();
        panel.webview.postMessage({ command: 'setMode', mode });

        if (mode === 'preview') {
            panel.webview.html = this.getPreviewHtml(content);
        } else {
            panel.webview.html = this.getEditHtml(content);
        }
    }

    private async saveDocument(document: vscode.TextDocument, content: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        edit.replace(document.uri, fullRange, content);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }

    private getEditHtml(content: string): string {
        const nonce = this.getNonce();
        const escapedContent = JSON.stringify(content);

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Markdown Editor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: var(--vscode-editor-background);
        }
        .toolbar {
            display: flex;
            justify-content: flex-end;
            padding: 8px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .mode-toggle {
            display: flex;
            background: var(--vscode-button-secondaryBackground);
            border-radius: 4px;
            padding: 2px;
        }
        .mode-btn {
            padding: 4px 12px;
            border: none;
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
        }
        .mode-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .mode-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .editor-container {
            flex: 1;
            padding: 16px;
        }
        textarea {
            width: 100%;
            height: 100%;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: none;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 14px;
            line-height: 1.6;
            resize: none;
            outline: none;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="mode-toggle">
            <button class="mode-btn" id="previewBtn" onclick="switchMode('preview')">Preview</button>
            <button class="mode-btn active" id="editBtn" onclick="switchMode('edit')">Markdown</button>
        </div>
    </div>
    <div class="editor-container">
        <textarea id="editor"></textarea>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('editor').value = ${escapedContent};

        function switchMode(mode) {
            vscode.postMessage({ command: 'switchMode', mode });
        }

        window.addEventListener('message', event => {
            if (event.data.command === 'setMode') {
                document.getElementById('previewBtn').classList.toggle('active', event.data.mode === 'preview');
                document.getElementById('editBtn').classList.toggle('active', event.data.mode === 'edit');
            }
        });

        let timeout;
        document.getElementById('editor').addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                vscode.postMessage({ command: 'save', content: e.target.value });
            }, 500);
        });
    </script>
</body>
</html>`;
    }

    private getPreviewHtml(content: string): string {
        const nonce = this.getNonce();
        marked.setOptions({ gfm: true, breaks: true });
        const htmlContent = marked.parse(content);

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Markdown Preview</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: var(--vscode-editor-background);
        }
        .toolbar {
            display: flex;
            justify-content: flex-end;
            padding: 8px 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .mode-toggle {
            display: flex;
            background: var(--vscode-button-secondaryBackground);
            border-radius: 4px;
            padding: 2px;
        }
        .mode-btn {
            padding: 4px 12px;
            border: none;
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
        }
        .mode-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .mode-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .preview-container {
            flex: 1;
            padding: 24px 32px;
            overflow: auto;
        }
        .preview-content {
            max-width: 860px;
            margin: 0 auto;
            font-size: 14px;
            line-height: 1.6;
            color: var(--vscode-foreground);
        }
        .preview-content h1, .preview-content h2, .preview-content h3,
        .preview-content h4, .preview-content h5, .preview-content h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        .preview-content h1 {
            font-size: 2em;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }
        .preview-content h2 {
            font-size: 1.5em;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }
        .preview-content p { margin-bottom: 16px; }
        .preview-content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .preview-content a:hover { text-decoration: underline; }
        .preview-content ul, .preview-content ol {
            margin-bottom: 16px;
            padding-left: 2em;
        }
        .preview-content code {
            padding: 0.2em 0.4em;
            font-size: 85%;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, monospace;
        }
        .preview-content pre {
            margin-bottom: 16px;
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 6px;
        }
        .preview-content pre code {
            padding: 0;
            background-color: transparent;
        }
        .preview-content blockquote {
            margin-bottom: 16px;
            padding: 0 1em;
            color: var(--vscode-descriptionForeground);
            border-left: 0.25em solid var(--vscode-panel-border);
        }
        .preview-content table {
            display: block;
            width: 100%;
            overflow: auto;
            margin-bottom: 16px;
            border-collapse: collapse;
        }
        .preview-content th, .preview-content td {
            padding: 6px 13px;
            border: 1px solid var(--vscode-panel-border);
        }
        .preview-content img { max-width: 100%; }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="mode-toggle">
            <button class="mode-btn active" id="previewBtn" onclick="switchMode('preview')">Preview</button>
            <button class="mode-btn" id="editBtn" onclick="switchMode('edit')">Markdown</button>
        </div>
    </div>
    <div class="preview-container">
        <div class="preview-content">
            ${htmlContent}
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        function switchMode(mode) {
            vscode.postMessage({ command: 'switchMode', mode });
        }
        window.addEventListener('message', event => {
            if (event.data.command === 'setMode') {
                document.getElementById('previewBtn').classList.toggle('active', event.data.mode === 'preview');
                document.getElementById('editBtn').classList.toggle('active', event.data.mode === 'edit');
            }
        });
    </script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
