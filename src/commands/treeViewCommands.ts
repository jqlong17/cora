import * as vscode from 'vscode';
import { PageTreeProvider } from '../providers/pageTreeProvider';

export async function collapseAll(
    treeView: vscode.TreeView<unknown>
): Promise<void> {
    // VS Code TreeView API doesn't have a direct collapseAll method
    // We need to use the command
    await vscode.commands.executeCommand('workbench.actions.treeView.pageTree.collapseAll');
}

export async function expandAll(
    pageTreeProvider: PageTreeProvider,
    treeView: vscode.TreeView<unknown>
): Promise<void> {
    // Note: VS Code TreeView API doesn't support programmatic expansion of all nodes
    // This is a limitation of the current API
    // We can only expand one node at a time using reveal()
    vscode.window.showInformationMessage('全部展开功能将在后续版本优化');
}
