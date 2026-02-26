import * as vscode from 'vscode';
import type { PreviewProvider } from '../providers/previewProvider';

const CORA_VIEW_TYPE = 'cora.markdown.preview';

/**
 * 只读 CustomDocument，仅持有 uri，供 Custom Editor 使用
 */
class CoraMarkdownDocument implements vscode.CustomDocument {
    constructor(public readonly uri: vscode.Uri) {}
    dispose(): void {}
}

/**
 * 将 .md 等以「Cora 预览」形式打开的 Custom Editor Provider。
 * 当 workbench.editorAssociations 将 *.md 关联到本 viewType 时，从链接/资源管理器打开即直接用 Cora 预览。
 */
export class CoraMarkdownEditorProvider implements vscode.CustomReadonlyEditorProvider<CoraMarkdownDocument> {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly previewProvider: PreviewProvider
    ) {}

    openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): CoraMarkdownDocument {
        return new CoraMarkdownDocument(uri);
    }

    async resolveCustomEditor(
        document: CoraMarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri);
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri, ...workspaceFolders],
        };

        const html = await this.previewProvider.getPreviewHtml(document.uri, webviewPanel.webview);
        webviewPanel.webview.html = html;

        webviewPanel.webview.onDidReceiveMessage((msg: { command: string }) => {
            if (msg.command === 'openEditor') {
                vscode.commands.executeCommand('knowledgeBase.openEditor', document.uri);
            }
        });
    }
}

export const CORA_MARKDOWN_VIEW_TYPE = CORA_VIEW_TYPE;
