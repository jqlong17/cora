import * as vscode from 'vscode';
import * as path from 'path';
import { FileService, FileItem } from '../services/fileService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { generateNoteTitle, sanitizeFileName } from '../utils/markdownParser';
import { openPreview } from './editorCommands';

export async function newNote(
    item: { item: FileItem } | undefined,
    fileService: FileService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    // Determine the parent folder
    let parentUri: vscode.Uri;
    if (item && item.item.type === 'directory') {
        parentUri = item.item.uri;
    } else if (item && item.item.type === 'file') {
        parentUri = vscode.Uri.file(path.dirname(item.item.uri.fsPath));
    } else {
        // Use first workspace folder
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return;
        }
        parentUri = folders[0].uri;
    }

    // Ask for file name
    const defaultName = `${generateNoteTitle()}.md`;
    const fileName = await vscode.window.showInputBox({
        prompt: '输入笔记文件名',
        value: defaultName,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return '文件名不能为空';
            }
            return null;
        }
    });

    if (!fileName) {
        return;
    }

    const sanitizedName = sanitizeFileName(fileName);
    const newUri = await fileService.createFile(parentUri, sanitizedName);

    if (newUri) {
        pageTreeProvider.refresh();
        // Open the new file
        await openPreview(newUri);
        vscode.window.showInformationMessage(`已创建笔记: ${sanitizedName}`);
    } else {
        vscode.window.showErrorMessage('创建笔记失败');
    }
}

export async function newFolder(
    item: { item: FileItem } | undefined,
    fileService: FileService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    // Determine the parent folder
    let parentUri: vscode.Uri;
    if (item && item.item.type === 'directory') {
        parentUri = item.item.uri;
    } else if (item && item.item.type === 'file') {
        parentUri = vscode.Uri.file(path.dirname(item.item.uri.fsPath));
    } else {
        // Use first workspace folder
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return;
        }
        parentUri = folders[0].uri;
    }

    // Ask for folder name
    const folderName = await vscode.window.showInputBox({
        prompt: '输入文件夹名称',
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return '文件夹名称不能为空';
            }
            return null;
        }
    });

    if (!folderName) {
        return;
    }

    const sanitizedName = sanitizeFileName(folderName);
    const newUri = await fileService.createFolder(parentUri, sanitizedName);

    if (newUri) {
        pageTreeProvider.refresh();
        vscode.window.showInformationMessage(`已创建文件夹: ${sanitizedName}`);
    } else {
        vscode.window.showErrorMessage('创建文件夹失败');
    }
}

export async function deleteItem(
    item: { item: FileItem },
    fileService: FileService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const itemName = item.item.name;
    const itemType = item.item.type === 'directory' ? '文件夹' : '文件';

    const result = await vscode.window.showWarningMessage(
        `确定要删除${itemType} "${itemName}" 吗？`,
        { modal: true },
        '删除'
    );

    if (result !== '删除') {
        return;
    }

    const success = await fileService.deleteItem(item.item.uri);

    if (success) {
        pageTreeProvider.refresh();
        vscode.window.showInformationMessage(`已删除${itemType}: ${itemName}`);
    } else {
        vscode.window.showErrorMessage(`删除${itemType}失败`);
    }
}

export async function renameItem(
    item: { item: FileItem },
    fileService: FileService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const currentName = item.item.name;
    const itemType = item.item.type === 'directory' ? '文件夹' : '文件';

    const newName = await vscode.window.showInputBox({
        prompt: `重命名${itemType}`,
        value: currentName,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return '名称不能为空';
            }
            if (value === currentName) {
                return '新名称不能与旧名称相同';
            }
            return null;
        }
    });

    if (!newName) {
        return;
    }

    const sanitizedName = sanitizeFileName(newName);
    const newUri = await fileService.renameItem(item.item.uri, sanitizedName);

    if (newUri) {
        pageTreeProvider.refresh();
        vscode.window.showInformationMessage(`已重命名为: ${sanitizedName}`);
    } else {
        vscode.window.showErrorMessage('重命名失败');
    }
}
