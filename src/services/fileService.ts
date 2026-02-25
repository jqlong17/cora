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
    constructor(private configService: ConfigService) { }

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
            const sortOrder = this.configService.getSortOrder();
            const filterMode = this.configService.getFilterMode();
            const markdownExtensions = this.configService.getMarkdownExtensions();

            const items: (FileItem & { mtime: number; ctime: number })[] = [];

            for (const entry of entries) {
                // Skip hidden files and folders
                if (entry.name.startsWith('.')) {
                    continue;
                }

                const entryPath = path.join(targetUri.fsPath, entry.name);
                const entryUri = vscode.Uri.file(entryPath);

                if (entry.isDirectory()) {
                    try {
                        const stat = await fs.promises.stat(entryPath);
                        items.push({
                            uri: entryUri,
                            type: 'directory',
                            name: entry.name,
                            mtime: stat.mtimeMs,
                            ctime: stat.birthtimeMs
                        });
                    } catch {
                        items.push({
                            uri: entryUri,
                            type: 'directory',
                            name: entry.name,
                            mtime: 0,
                            ctime: 0
                        });
                    }
                } else if (entry.isFile()) {
                    // Apply filter
                    if (filterMode === 'markdown') {
                        if (!isMarkdownFile(entry.name, markdownExtensions)) {
                            continue;
                        }
                    }
                    try {
                        const stat = await fs.promises.stat(entryPath);
                        items.push({
                            uri: entryUri,
                            type: 'file',
                            name: entry.name,
                            mtime: stat.mtimeMs,
                            ctime: stat.birthtimeMs
                        });
                    } catch {
                        items.push({
                            uri: entryUri,
                            type: 'file',
                            name: entry.name,
                            mtime: 0,
                            ctime: 0
                        });
                    }
                }
            }

            // Sort: directories first, then files, then apply user sort order within each group
            items.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') { return -1; }
                if (a.type !== 'directory' && b.type === 'directory') { return 1; }

                switch (sortOrder) {
                    case 'nameAsc': return a.name.localeCompare(b.name);
                    case 'nameDesc': return b.name.localeCompare(a.name);
                    case 'mtimeDesc': return b.mtime - a.mtime;
                    case 'mtimeAsc': return a.mtime - b.mtime;
                    case 'ctimeDesc': return b.ctime - a.ctime;
                    case 'ctimeAsc': return a.ctime - b.ctime;
                    default: return a.name.localeCompare(b.name);
                }
            });

            return items;
        } catch (error) {
            console.error('Error reading directory:', error);
            return [];
        }
    }

    /**
     * 递归收集所有 Markdown 文件，按配置排序（平铺视图用）。
     */
    async getAllMarkdownFilesSortedByConfig(): Promise<FileItem[]> {
        const folders = this.getWorkspaceFolders();
        if (folders.length === 0) {
            return [];
        }
        const markdownExtensions = this.configService.getMarkdownExtensions();
        const sortOrder = this.configService.getSortOrder();
        const collected: { uri: vscode.Uri; name: string; mtime: number; ctime: number }[] = [];

        const collectFromDir = async (dirPath: string): Promise<void> => {
            try {
                const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.name.startsWith('.')) {
                        continue;
                    }
                    if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        await collectFromDir(fullPath);
                    } else if (entry.isFile() && isMarkdownFile(entry.name, markdownExtensions)) {
                        try {
                            const stat = await fs.promises.stat(fullPath);
                            collected.push({
                                uri: vscode.Uri.file(fullPath),
                                name: entry.name,
                                mtime: stat.mtimeMs,
                                ctime: stat.birthtimeMs
                            });
                        } catch {
                            // skip unreadable files
                        }
                    }
                }
            } catch (error) {
                console.error('Error reading directory in flat view:', error);
            }
        };

        for (const folder of folders) {
            await collectFromDir(folder.uri.fsPath);
        }

        collected.sort((a, b) => {
            switch (sortOrder) {
                case 'nameAsc': return a.name.localeCompare(b.name);
                case 'nameDesc': return b.name.localeCompare(a.name);
                case 'mtimeDesc': return b.mtime - a.mtime;
                case 'mtimeAsc': return a.mtime - b.mtime;
                case 'ctimeDesc': return b.ctime - a.ctime;
                case 'ctimeAsc': return a.ctime - b.ctime;
                default: return b.mtime - a.mtime;
            }
        });

        return collected.map(({ uri, name }) => ({
            uri,
            type: 'file' as const,
            name
        }));
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
