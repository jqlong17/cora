import * as vscode from 'vscode';
import type { PreviewProvider } from '../providers/previewProvider';
import type { OutlineProvider } from '../providers/outlineProvider';
import { t } from '../utils/i18n';

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

    // 若已经配置了预览提供者，则优先使用预览环境进行统一体验跳转
    if (previewProvider && documentUri) {
        await previewProvider.openPreview(documentUri, line);
        return;
    }

    // Fallback 到原生编辑器逻辑 (如果预览未就绪)
    const needOpenUri = documentUri && (!editor || editor.document.uri.toString() !== documentUri.toString());
    if (needOpenUri && documentUri) {
        const doc = await vscode.workspace.openTextDocument(documentUri);
        editor = await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
        });
    } else if (!editor) {
        const fallback = documentUri ?? getActiveFileUri();
        if (!fallback) {
            vscode.window.showWarningMessage(t('msg.noActiveEditor'));
            return;
        }
        const doc = await vscode.workspace.openTextDocument(fallback);
        editor = await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
        });
    }

    if (editor) {
        const position = new vscode.Position(line, 0);
        const selection = new vscode.Selection(position, position);

        editor.selection = selection;
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
    }
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
