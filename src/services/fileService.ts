import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './configService';
import { isMarkdownFile } from '../utils/markdownParser';

export interface FileItem {
    uri: vscode.Uri;
    type: 'file' | 'directory';
    name: string;
}

export class FileService {
    constructor(private configService: ConfigService) {}

    getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
        return vscode.workspace.workspaceFolders || [];
    }

    async getChildren(item?: FileItem): Promise<FileItem[]> {
        let targetUri: vscode.Uri;

        if (item) {
            targetUri = item.uri;
        } else {
            const folders = this.getWorkspaceFolders();
            if (folders.length === 0) {
                return [];
            }
            if (folders.length === 1) {
                targetUri = folders[0].uri;
            } else {
                // Multiple workspace folders - show root folders
                return folders.map(folder => ({
                    uri: folder.uri,
                    type: 'directory',
                    name: folder.name
                }));
            }
        }

        try {
            const entries = await fs.promises.readdir(targetUri.fsPath, { withFileTypes: true });
            const items: FileItem[] = [];

            // Sort: directories first, then files (alphabetically within each group)
            const sortedEntries = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) { return -1; }
                if (!a.isDirectory() && b.isDirectory()) { return 1; }
                return a.name.localeCompare(b.name);
            });

            const filterMode = this.configService.getFilterMode();
            const markdownExtensions = this.configService.getMarkdownExtensions();

            for (const entry of sortedEntries) {
                // Skip hidden files and folders
                if (entry.name.startsWith('.')) {
                    continue;
                }

                const entryPath = path.join(targetUri.fsPath, entry.name);
                const entryUri = vscode.Uri.file(entryPath);

                if (entry.isDirectory()) {
                    items.push({
                        uri: entryUri,
                        type: 'directory',
                        name: entry.name
                    });
                } else if (entry.isFile()) {
                    // Apply filter
                    if (filterMode === 'markdown') {
                        if (!isMarkdownFile(entry.name, markdownExtensions)) {
                            continue;
                        }
                    }
                    items.push({
                        uri: entryUri,
                        type: 'file',
                        name: entry.name
                    });
                }
            }

            return items;
        } catch (error) {
            console.error('Error reading directory:', error);
            return [];
        }
    }

    async createFile(parentUri: vscode.Uri, fileName: string): Promise<vscode.Uri | null> {
        const filePath = path.join(parentUri.fsPath, fileName);
        try {
            await fs.promises.writeFile(filePath, '', 'utf8');
            return vscode.Uri.file(filePath);
        } catch (error) {
            console.error('Error creating file:', error);
            return null;
        }
    }

    async createFolder(parentUri: vscode.Uri, folderName: string): Promise<vscode.Uri | null> {
        const folderPath = path.join(parentUri.fsPath, folderName);
        try {
            await fs.promises.mkdir(folderPath, { recursive: true });
            return vscode.Uri.file(folderPath);
        } catch (error) {
            console.error('Error creating folder:', error);
            return null;
        }
    }

    async deleteItem(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await fs.promises.stat(uri.fsPath);
            if (stat.isDirectory()) {
                await fs.promises.rm(uri.fsPath, { recursive: true, force: true });
            } else {
                await fs.promises.unlink(uri.fsPath);
            }
            return true;
        } catch (error) {
            console.error('Error deleting item:', error);
            return false;
        }
    }

    async renameItem(uri: vscode.Uri, newName: string): Promise<vscode.Uri | null> {
        const parentPath = path.dirname(uri.fsPath);
        const newPath = path.join(parentPath, newName);
        try {
            await fs.promises.rename(uri.fsPath, newPath);
            return vscode.Uri.file(newPath);
        } catch (error) {
            console.error('Error renaming item:', error);
            return null;
        }
    }

    async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await fs.promises.access(uri.fsPath);
            return true;
        } catch {
            return false;
        }
    }

    async readFile(uri: vscode.Uri): Promise<string> {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');
            return content;
        } catch (error) {
            console.error('Error reading file:', error);
            return '';
        }
    }

    async createFileWithContent(parentUri: vscode.Uri, fileName: string, content: string): Promise<vscode.Uri | null> {
        const filePath = path.join(parentUri.fsPath, fileName);
        try {
            await fs.promises.writeFile(filePath, content, 'utf8');
            return vscode.Uri.file(filePath);
        } catch (error) {
            console.error('Error creating file:', error);
            return null;
        }
    }
}
