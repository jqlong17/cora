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

export async function openEditor(
    uri?: vscode.Uri,
    previewProvider?: PreviewProvider
): Promise<void> {
    if (!uri) {
        // Try to get from active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            uri = activeEditor.document.uri;
        } else {
            // Try to get preview's document from active tab
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                uri = getUriFromTab(activeTab);
            }

            // Fallback to PreviewProvider's state if tab extraction fails
            if ((!uri || uri.scheme === 'webview-panel') && previewProvider) {
                uri = previewProvider.getCurrentUri();
            }

            if (!uri || uri.scheme === 'webview-panel') {
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

    // 1. 直接获取 URI
    if (input.uri) {
        return typeof input.uri === 'string' ? vscode.Uri.file(input.uri) : input.uri;
    }

    // 2. 处理 Webview 面板 (coraPreview)
    // 这种情况下，我们需要从面板的原始数据中恢复 URI
    if (input.viewType === 'coraPreview') {
        // 在 VS Code 中，WebviewPanel 的输入可能不直接包含资源 URI
        // 但我们在 PreviewProvider 中保存了 currentUri。
        // 这里需要一种可靠的方式拿回它。
        const possibleRes = input.resource;
        if (possibleRes) {
            return typeof possibleRes === 'string' ? vscode.Uri.file(possibleRes) : possibleRes;
        }
    }

    // 3. 通用预览类型 (Markdown Preview)
    const previewViewTypes = ['markdown.preview', 'vscode.markdown.preview'];
    if (previewViewTypes.includes(input.viewType)) {
        const res = input.resource;
        if (res) {
            return typeof res === 'string' ? vscode.Uri.file(res) : res;
        }
    }

    // 4. 其他备选路径
    const possibleUri = input.resource || input.path || input.document;
    if (possibleUri) {
        const u = typeof possibleUri === 'string' ? vscode.Uri.file(possibleUri) : possibleUri;
        // 过滤掉虚拟的 webview-panel 协议
        if (u.scheme !== 'webview-panel') {
            return u;
        }
    }

    return undefined;
}
