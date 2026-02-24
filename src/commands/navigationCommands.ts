import * as vscode from 'vscode';
import type { PreviewProvider } from '../providers/previewProvider';
import type { OutlineProvider } from '../providers/outlineProvider';

export async function gotoHeading(
    line: number,
    documentUriStr?: string,
    previewProvider?: PreviewProvider,
    outlineProvider?: OutlineProvider
): Promise<void> {
    let editor = vscode.window.activeTextEditor;

    // TreeItem 命令参数以字符串传递（file:///...）；缺失时用预览当前 URI，再 fallback 到大纲当前文档 URI
    const documentUri = documentUriStr
        ? vscode.Uri.parse(documentUriStr)
        : previewProvider?.getCurrentUri() ?? outlineProvider?.getCurrentDocumentUri();

    // 若大纲传入了文档 URI，且当前无活动编辑器或活动编辑器不是该文档（如预览/编辑模式为 Webview），则打开该文档
    const needOpenUri = documentUri && (!editor || editor.document.uri.toString() !== documentUri.toString());
    if (needOpenUri) {
        const doc = await vscode.workspace.openTextDocument(documentUri);
        editor = await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
        });
    } else if (!editor) {
        const fallback = documentUri ?? getActiveFileUri();
        if (!fallback) {
            vscode.window.showWarningMessage('没有活动的编辑器');
            return;
        }
        const doc = await vscode.workspace.openTextDocument(fallback);
        editor = await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
        });
    }

    const position = new vscode.Position(line, 0);
    const selection = new vscode.Selection(position, position);

    editor.selection = selection;
    editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

function getActiveFileUri(): vscode.Uri | undefined {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!tab) { return undefined; }

    const input = tab.input as any;
    if (!input) { return undefined; }

    const raw = input.uri || input.resource;
    if (!raw) { return undefined; }

    return typeof raw === 'string' ? vscode.Uri.file(raw) : raw;
}
