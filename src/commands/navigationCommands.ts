import * as vscode from 'vscode';

export async function gotoHeading(line: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('没有活动的编辑器');
        return;
    }

    const position = new vscode.Position(line, 0);
    const selection = new vscode.Selection(position, position);

    editor.selection = selection;
    editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}
