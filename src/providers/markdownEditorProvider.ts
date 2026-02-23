import * as vscode from 'vscode';
import { marked } from 'marked';

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

        this.setInitialHtml(document, webviewPanel);

        const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                const content = e.document.getText();
                webviewPanel.webview.postMessage({ command: 'updateContent', content });
            }
        });

        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            console.log('[Cora Custom Editor] Received message:', message);
            if (message.command === 'switchMode') {
                console.log('[Cora Custom Editor] Switching mode to:', message.mode);
                webviewPanel.webview.postMessage({ command: 'setMode', mode: message.mode });
            } else if (message.command === 'save') {
                console.log('[Cora Custom Editor] Saving document');
                await this.saveDocument(document, message.content);
            } else if (message.command === 'ready') {
                console.log('[Cora Custom Editor] Webview ready, setting preview mode');
                webviewPanel.webview.postMessage({ command: 'setMode', mode: 'preview' });
            } else if (message.command === 'log') {
                // Log messages from webview
                console.log('[Cora Webview]', message.data);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeSubscription.dispose();
        });
    }

    private setInitialHtml(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
        const content = document.getText();
        panel.webview.html = this.getHtml(content);
        // The webview will send 'ready' message when loaded, then we set preview mode
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

    private getHtml(content: string): string {
        const nonce = this.getNonce();
        marked.setOptions({ gfm: true, breaks: true });
        const htmlContent = marked.parse(content);
        const escapedContent = JSON.stringify(content);

        const css = this.getCSS();
        const js = this.getJS(escapedContent, nonce);

        return `<!DOCTYPE html>
<html lang="zh-CN" data-initial-mode="preview">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Markdown Editor</title>
    <style>${css}</style>
</head>
<body>
    <div class="toolbar">
        <div class="mode-toggle">
            <button class="mode-btn" id="previewBtn" onclick="switchMode('preview')">Preview</button>
            <button class="mode-btn" id="editBtn" onclick="switchMode('edit')">Markdown</button>
        </div>
        <div id="debugMode" style="margin-left: 16px; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: white; background: #666;">Mode: initializing...</div>
    </div>
    <div class="content-area">
        <div class="view editor-view hidden" id="editorView">
            <textarea id="editor"></textarea>
        </div>
        <div class="view preview-view" id="previewView">
            <div class="preview-content" id="previewContent">${htmlContent}</div>
        </div>
    </div>
    <script nonce="${nonce}">${js}</script>
</body>
</html>`;
    }

    private getCSS(): string {
        return `
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
    flex-shrink: 0;
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
.content-area {
    flex: 1;
    overflow: hidden;
    position: relative;
}
.view {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
}
.view.hidden {
    display: none;
}
.editor-view {
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
.preview-view {
    padding: 24px 32px;
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
`;
    }

    private getJS(escapedContent: string, nonce: string): string {
        return `
const vscode = acquireVsCodeApi();

// Debug logging helper
function debugLog(...args) {
    const msg = '[Cora Webview] ' + args.join(' ');
    console.log(msg);
    vscode.postMessage({ command: 'log', data: args.join(' ') });
}

debugLog('=== Webview Script Loading ===');

// Always default to preview mode, ignore any persisted state
const DEFAULT_MODE = 'preview';
let currentMode = DEFAULT_MODE;

debugLog('DEFAULT_MODE:', DEFAULT_MODE);
debugLog('currentMode initialized to:', currentMode);

document.getElementById('editor').value = ${escapedContent};

function switchMode(mode) {
    debugLog('switchMode called:', mode);
    currentMode = mode;
    vscode.setState({ mode: mode });
    updateUI(mode);
}

function updateUI(mode) {
    debugLog('updateUI called with mode:', mode);
    document.getElementById('previewBtn').classList.toggle('active', mode === 'preview');
    document.getElementById('editBtn').classList.toggle('active', mode === 'edit');
    document.getElementById('editorView').classList.toggle('hidden', mode !== 'edit');
    document.getElementById('previewView').classList.toggle('hidden', mode !== 'preview');

    // Update debug display
    const debugEl = document.getElementById('debugMode');
    if (debugEl) {
        debugEl.textContent = 'Mode: ' + mode;
        debugEl.style.background = mode === 'preview' ? '#4CAF50' : '#2196F3';
    }

    if (mode === 'edit') {
        setTimeout(function() { document.getElementById('editor').focus(); }, 0);
    }
}

let timeout;
document.getElementById('editor').addEventListener('input', function(e) {
    clearTimeout(timeout);
    timeout = setTimeout(function() {
        vscode.postMessage({ command: 'save', content: e.target.value });
    }, 500);
});

window.addEventListener('message', function(event) {
    debugLog('Received message:', event.data.command);
    if (event.data.command === 'setMode') {
        debugLog('Setting mode to:', event.data.mode);
        currentMode = event.data.mode;
        updateUI(event.data.mode);
    } else if (event.data.command === 'updateContent') {
        document.getElementById('editor').value = event.data.content;
    }
});

// Initialize with default mode (preview)
debugLog('Calling updateUI with DEFAULT_MODE:', DEFAULT_MODE);
updateUI(DEFAULT_MODE);

// Also notify extension that we're ready
debugLog('Sending ready message to extension');
vscode.postMessage({ command: 'ready' });

// Log initial state of elements
debugLog('editorView hidden class:', document.getElementById('editorView').classList.contains('hidden'));
debugLog('previewView hidden class:', document.getElementById('previewView').classList.contains('hidden'));
`;
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
