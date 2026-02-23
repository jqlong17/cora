import * as vscode from 'vscode';
import * as path from 'path';
import { FileItem } from '../services/fileService';

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

export async function copyPath(item: { item: FileItem }): Promise<void> {
    if (!item || !item.item) {
        return;
    }

    try {
        await vscode.env.clipboard.writeText(item.item.uri.fsPath);
        vscode.window.showInformationMessage('已复制绝对路径到剪贴板');
    } catch (error) {
        vscode.window.showErrorMessage(`复制路径失败: ${error}`);
    }
}

export async function copyRelativePath(item: { item: FileItem }): Promise<void> {
    if (!item || !item.item) {
        return;
    }

    try {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(item.item.uri);
        if (!workspaceFolder) {
            // 如果不在工作区中，复制文件名
            await vscode.env.clipboard.writeText(item.item.name);
            vscode.window.showInformationMessage('已复制文件名到剪贴板');
            return;
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, item.item.uri.fsPath);
        await vscode.env.clipboard.writeText(relativePath);
        vscode.window.showInformationMessage('已复制相对路径到剪贴板');
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
