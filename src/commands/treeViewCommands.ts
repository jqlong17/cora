import * as vscode from 'vscode';
import type { OutlineProvider } from '../providers/outlineProvider';

const OUTLINE_VIEW_ID = 'kbOutline';

export async function outlineCollapseAll(): Promise<void> {
    await vscode.commands.executeCommand(`workbench.actions.treeView.${OUTLINE_VIEW_ID}.collapseAll`);
}

/** 通过 reveal() 逐节点展开，绕过 VS Code 缓存折叠状态的限制 */
export async function outlineExpandAll(outlineProvider: OutlineProvider): Promise<void> {
    await outlineProvider.expandAll();
}
