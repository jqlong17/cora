import * as vscode from 'vscode';

export async function gotoHeading(line: number): Promise<void> {
    let editor = vscode.window.activeTextEditor;

    if (!editor) {
        const uri = getActiveFileUri();
        if (!uri) {
            vscode.window.showWarningMessage('没有活动的编辑器');
            return;
        }
        const doc = await vscode.workspace.openTextDocument(uri);
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
