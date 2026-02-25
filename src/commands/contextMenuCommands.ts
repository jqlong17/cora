import * as vscode from 'vscode';
import * as path from 'path';
import { FileItem } from '../services/fileService';
import type { PageTreeItem } from '../providers/pageTreeProvider';
import { t } from '../utils/i18n';

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
        vscode.window.showErrorMessage(`${t('msg.revealFailed')}: ${error}`);
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
            fileItems.length > 1 ? t('msg.copiedAbsolutePathMulti', { n: fileItems.length }) : t('msg.copiedAbsolutePath')
        );
    } catch (error) {
        vscode.window.showErrorMessage(`${t('msg.copyPathFailed')}: ${error}`);
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
            fileItems.length > 1 ? t('msg.copiedRelativePathMulti', { n: fileItems.length }) : t('msg.copiedRelativePath')
        );
    } catch (error) {
        vscode.window.showErrorMessage(`${t('msg.copyRelativePathFailed')}: ${error}`);
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

        let newName = `${baseName} ${t('msg.copyFileSuffix')}${ext}`;
        let targetUri = vscode.Uri.file(path.join(parentDir, newName));

        let counter = 1;
        while (await fileService.fileExists(targetUri)) {
            newName = `${baseName} ${t('msg.copyFileSuffixWithNum', { n: counter })}${ext}`;
            targetUri = vscode.Uri.file(path.join(parentDir, newName));
            counter++;
        }

        // 读取源文件内容
        const fs = require('fs').promises;
        const content = await fs.readFile(sourceUri.fsPath);

        // 创建新文件
        await fs.writeFile(targetUri.fsPath, content);

        vscode.window.showInformationMessage(t('msg.copiedFile', { name: newName }));
    } catch (error) {
        vscode.window.showErrorMessage(`${t('msg.copyFileFailed')}: ${error}`);
    }
}
