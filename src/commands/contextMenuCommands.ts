import * as vscode from 'vscode';
import * as path from 'path';
import { FileItem } from '../services/fileService';
import type { PageTreeItem } from '../providers/pageTreeProvider';

function getSelectedFileItems(
    item: { item: FileItem } | undefined,
    pageTreeView: vscode.TreeView<PageTreeItem> | undefined
): FileItem[] {
    const selected = pageTreeView?.selection?.length
        ? pageTreeView.selection
        : item?.item ? [{ item: item.item } as PageTreeItem] : [];
    const fileItems: FileItem[] = [];
    for (const node of selected) {
        const fi = node?.item;
        if (fi && fi.type === 'file') {
            fileItems.push(fi);
        }
    }
    return fileItems;
}

export async function revealInFinder(item: { item: FileItem }): Promise<void> {
    if (!item || !item.item) {
        return;
    }

    try {
        await vscode.commands.executeCommand('revealFileInOS', item.item.uri);
    } catch (error) {
        vscode.window.showErrorMessage(`无法在 Finder 中打开: ${error}`);
    }
}

export async function copyPath(
    item: { item: FileItem } | undefined,
    pageTreeView?: vscode.TreeView<PageTreeItem>
): Promise<void> {
    const fileItems = getSelectedFileItems(item, pageTreeView);
    if (fileItems.length === 0) {
        return;
    }

    try {
        const text = fileItems.map((fi) => fi.uri.fsPath).join('\n');
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
            fileItems.length > 1 ? `已复制 ${fileItems.length} 个文件的绝对路径` : '已复制绝对路径到剪贴板'
        );
    } catch (error) {
        vscode.window.showErrorMessage(`复制路径失败: ${error}`);
    }
}

export async function copyRelativePath(
    item: { item: FileItem } | undefined,
    pageTreeView?: vscode.TreeView<PageTreeItem>
): Promise<void> {
    const fileItems = getSelectedFileItems(item, pageTreeView);
    if (fileItems.length === 0) {
        return;
    }

    try {
        const lines: string[] = [];
        for (const fi of fileItems) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fi.uri);
            if (!workspaceFolder) {
                lines.push(fi.name);
            } else {
                lines.push(path.relative(workspaceFolder.uri.fsPath, fi.uri.fsPath));
            }
        }
        await vscode.env.clipboard.writeText(lines.join('\n'));
        vscode.window.showInformationMessage(
            fileItems.length > 1 ? `已复制 ${fileItems.length} 个文件的相对路径` : '已复制相对路径到剪贴板'
        );
    } catch (error) {
        vscode.window.showErrorMessage(`复制相对路径失败: ${error}`);
    }
}

export async function copyFile(item: { item: FileItem }, fileService: any): Promise<void> {
    if (!item || !item.item) {
        return;
    }

    try {
        const sourceUri = item.item.uri;
        const parentDir = path.dirname(sourceUri.fsPath);
        const ext = path.extname(item.item.name);
        const baseName = path.basename(item.item.name, ext);

        // 生成新文件名：原文件名 + " 副本" + 扩展名
        let newName = `${baseName} 副本${ext}`;
        let targetUri = vscode.Uri.file(path.join(parentDir, newName));

        // 检查文件是否已存在，如果存在则添加数字后缀
        let counter = 1;
        while (await fileService.fileExists(targetUri)) {
            newName = `${baseName} 副本 ${counter}${ext}`;
            targetUri = vscode.Uri.file(path.join(parentDir, newName));
            counter++;
        }

        // 读取源文件内容
        const fs = require('fs').promises;
        const content = await fs.readFile(sourceUri.fsPath);

        // 创建新文件
        await fs.writeFile(targetUri.fsPath, content);

        vscode.window.showInformationMessage(`已复制文件: ${newName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`复制文件失败: ${error}`);
    }
}
