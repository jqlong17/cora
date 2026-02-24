import * as vscode from 'vscode';
import type { PreviewProvider } from '../providers/previewProvider';

/** 使用 Cora 自带预览（含 Mermaid）打开文件 */
export async function openPreview(
    previewProvider: PreviewProvider,
    uri?: vscode.Uri
): Promise<void> {
    if (!uri) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            uri = activeEditor.document.uri;
        } else {
            vscode.window.showWarningMessage('请先选择一个文件');
            return;
        }
    }
    await previewProvider.openPreview(uri);
}

export async function openEditor(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
        // Try to get from active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            uri = activeEditor.document.uri;
        } else {
            // Try to get preview's document from active tab
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                // Handle different tab input types
                const input = activeTab.input as any;
                if (input && input.uri) {
                    uri = input.uri;
                } else if (input && typeof input === 'object') {
                    // Try to extract uri from various input formats
                    const possibleUri = input.uri || input.resource || input.path;
                    if (possibleUri) {
                        uri = typeof possibleUri === 'string' ? vscode.Uri.file(possibleUri) : possibleUri;
                    }
                }
            }

            if (!uri) {
                vscode.window.showWarningMessage('请先选择一个文件');
                return;
            }
        }
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.One
    });
}

export async function togglePreviewEditor(
    previewProvider: PreviewProvider
): Promise<void> {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!activeTab) {
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        await openPreview(previewProvider, activeEditor.document.uri);
    } else {
        let uri = getUriFromTab(activeTab);
        if (!uri && previewProvider.hasOpenPanel()) {
            uri = previewProvider.getCurrentUri();
        }
        if (uri) {
            await openEditor(uri);
        } else {
            vscode.window.showWarningMessage('无法识别当前文件');
        }
    }
}

// Helper function to extract URI from a tab
function getUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
    const input = tab.input as any;
    if (!input) {
        return undefined;
    }

    if (input.uri) {
        return typeof input.uri === 'string' ? vscode.Uri.file(input.uri) : input.uri;
    }

    if (input.viewType === 'markdown.preview' && input.resource) {
        return typeof input.resource === 'string' ? vscode.Uri.file(input.resource) : input.resource;
    }

    const possibleUri = input.resource || input.path || input.document;
    if (possibleUri) {
        return typeof possibleUri === 'string' ? vscode.Uri.file(possibleUri) : possibleUri;
    }

    return undefined;
}
