import * as vscode from 'vscode';
import * as path from 'path';

export async function openPreview(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
        // Try to get from active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            uri = activeEditor.document.uri;
        } else {
            vscode.window.showWarningMessage('请先选择一个文件');
            return;
        }
    }

    try {
        // Open the markdown preview
        await vscode.commands.executeCommand('markdown.showPreview', uri);
    } catch (error) {
        // If it's not a markdown file, just open it normally
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, {
            preview: true,
            viewColumn: vscode.ViewColumn.One
        });
    }
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

export async function togglePreviewEditor(): Promise<void> {
    // Get active tab to check current state
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!activeTab) {
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
    }

    // Check if current active editor is a text editor (editing mode)
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        // Currently in edit mode, switch to preview
        await openPreview(activeEditor.document.uri);
    } else {
        // Currently in preview mode or no editor, switch to edit
        const uri = getUriFromTab(activeTab);
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
