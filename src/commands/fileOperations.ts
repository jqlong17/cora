import * as vscode from 'vscode';
import * as path from 'path';
import { FileService, FileItem } from '../services/fileService';
import { PageTreeProvider, PageTreeItem } from '../providers/pageTreeProvider';
import { generateNoteTitle, sanitizeFileName } from '../utils/markdownParser';
import type { PreviewProvider } from '../providers/previewProvider';
import { openPreview } from './editorCommands';
import { t } from '../utils/i18n';

export async function newNote(
    item: { item: FileItem } | undefined,
    fileService: FileService,
    pageTreeProvider: PageTreeProvider,
    previewProvider: PreviewProvider,
    treeView?: vscode.TreeView<PageTreeItem>
): Promise<void> {
    // Determine the parent folder
    let parentUri: vscode.Uri;
    if (item && item.item.type === 'directory') {
        parentUri = item.item.uri;
    } else if (item && item.item.type === 'file') {
        parentUri = vscode.Uri.file(path.dirname(item.item.uri.fsPath));
    } else {
        // Use first workspace folder；无选中时先定位到页面树根节点再显示输入框
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            vscode.window.showErrorMessage(t('msg.noWorkspace'));
            return;
        }
        parentUri = folders[0].uri;
        if (treeView) {
            const roots = await pageTreeProvider.getChildren();
            if (roots.length > 0) {
                await treeView.reveal(roots[0], { focus: true, expand: true });
            }
        }
    }

    const createAtPath = vscode.workspace.asRelativePath(parentUri, false);
    const defaultName = `${generateNoteTitle(t('newNote.untitledPrefix'))}.md`;
    const promptStr = createAtPath
        ? `${t('newNote.prompt')}（${t('newNote.createAt')}: ${createAtPath}/）`
        : t('newNote.prompt');
    const fileName = await vscode.window.showInputBox({
        prompt: promptStr,
        value: defaultName,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return t('newNote.nameRequired');
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
        await openPreview(previewProvider, newUri);
        vscode.window.showInformationMessage(`${t('newNote.created')}: ${sanitizedName}`);
    } else {
        vscode.window.showErrorMessage(t('newNote.createFailed'));
    }
}

export async function newFolder(
    item: { item: FileItem } | undefined,
    fileService: FileService,
    pageTreeProvider: PageTreeProvider,
    treeView?: vscode.TreeView<PageTreeItem>
): Promise<void> {
    // Determine the parent folder
    let parentUri: vscode.Uri;
    if (item && item.item.type === 'directory') {
        parentUri = item.item.uri;
    } else if (item && item.item.type === 'file') {
        parentUri = vscode.Uri.file(path.dirname(item.item.uri.fsPath));
    } else {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            vscode.window.showErrorMessage(t('msg.noWorkspace'));
            return;
        }
        parentUri = folders[0].uri;
        if (treeView) {
            const roots = await pageTreeProvider.getChildren();
            if (roots.length > 0) {
                await treeView.reveal(roots[0], { focus: true, expand: true });
            }
        }
    }

    const createAtPath = vscode.workspace.asRelativePath(parentUri, false);
    const folderPromptStr = createAtPath
        ? `${t('newFolder.prompt')}（${t('newFolder.createAt')}: ${createAtPath}/）`
        : t('newFolder.prompt');
    const folderName = await vscode.window.showInputBox({
        prompt: folderPromptStr,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return t('newFolder.nameRequired');
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
        vscode.window.showInformationMessage(`${t('newFolder.created')}: ${sanitizedName}`);
    } else {
        vscode.window.showErrorMessage(t('newFolder.createFailed'));
    }
}

export async function deleteItem(
    item: { item: FileItem },
    fileService: FileService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const itemName = item.item.name;
    const itemType = item.item.type === 'directory' ? t('fileOp.folder') : t('fileOp.file');

    const result = await vscode.window.showWarningMessage(
        t('fileOp.deleteConfirm', { type: itemType, name: itemName }),
        { modal: true },
        t('fileOp.delete')
    );

    if (result !== t('fileOp.delete')) {
        return;
    }

    const success = await fileService.deleteItem(item.item.uri);

    if (success) {
        pageTreeProvider.refresh();
        vscode.window.showInformationMessage(`${t('fileOp.deleted', { type: itemType })}: ${itemName}`);
    } else {
        vscode.window.showErrorMessage(t('fileOp.deleteFailed', { type: itemType }));
    }
}

export async function renameItem(
    item: { item: FileItem },
    fileService: FileService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const currentName = item.item.name;
    const itemType = item.item.type === 'directory' ? t('fileOp.folder') : t('fileOp.file');

    const newName = await vscode.window.showInputBox({
        prompt: t('fileOp.renamePrompt', { type: itemType }),
        value: currentName,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return t('fileOp.nameRequired');
            }
            if (value === currentName) {
                return t('fileOp.nameSame');
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
        vscode.window.showInformationMessage(`${t('fileOp.renamed')}: ${sanitizedName}`);
    } else {
        vscode.window.showErrorMessage(t('fileOp.renameFailed'));
    }
}
