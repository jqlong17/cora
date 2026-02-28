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

const FLAT_LIST_CACHE_TTL_MS = 30_000;

export class FileService {
    private flatListCache: { key: string; result: FileItem[]; timestamp: number } | null = null;

    constructor(private configService: ConfigService) { }

    clearFlatListCache(): void {
        this.flatListCache = null;
    }

    getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
        return vscode.workspace.workspaceFolders || [];
    }

    /** 当 filterMarkdownOnly 为 true 时仅返回 Markdown 文件；为 undefined 时使用 config filterMode（兼容旧逻辑）。 */
    async getChildren(item?: FileItem, options?: { filterMarkdownOnly?: boolean }): Promise<FileItem[]> {
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
            const filterMode = options?.filterMarkdownOnly !== undefined
                ? (options.filterMarkdownOnly ? 'markdown' : 'all')
                : this.configService.getFilterMode();
            const showHiddenFiles = this.configService.getShowHiddenFiles();
            const markdownExtensions = this.configService.getMarkdownExtensions();

            type EntryInfo = { entry: fs.Dirent; entryPath: string; entryUri: vscode.Uri; isDir: boolean };
            const toStat: EntryInfo[] = [];
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name === '.git') {
                    continue;
                }
                if (!showHiddenFiles && entry.name.startsWith('.')) {
                    continue;
                }
                const entryPath = path.join(targetUri.fsPath, entry.name);
                const entryUri = vscode.Uri.file(entryPath);
                if (entry.isFile() && filterMode === 'markdown' && !isMarkdownFile(entry.name, markdownExtensions)) {
                    continue;
                }
                toStat.push({ entry, entryPath, entryUri, isDir: entry.isDirectory() });
            }

            const stats = await Promise.all(
                toStat.map(({ entryPath }) => fs.promises.stat(entryPath).catch(() => null))
            );

            const items: (FileItem & { mtime: number; ctime: number })[] = [];
            for (let i = 0; i < toStat.length; i++) {
                const { entry, entryUri, isDir } = toStat[i];
                const stat = stats[i];
                const mtime = stat ? stat.mtimeMs : 0;
                const ctime = stat ? stat.birthtimeMs : 0;
                items.push({
                    uri: entryUri,
                    type: isDir ? 'directory' : 'file',
                    name: entry.name,
                    mtime,
                    ctime
                });
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
     * 递归收集所有文件（按 filterMarkdownOnly 或 config filterMode 筛选），按配置排序。用于平铺视图。
     * 结果带短期缓存（key = workspace + sortOrder + filterMode，TTL 30s），刷新/配置/文件变更时需 clearFlatListCache()。
     */
    async getAllFilesSortedByConfig(options?: { filterMarkdownOnly?: boolean }): Promise<FileItem[]> {
        const folders = this.getWorkspaceFolders();
        if (folders.length === 0) {
            return [];
        }
        const filterMode = options?.filterMarkdownOnly !== undefined
            ? (options.filterMarkdownOnly ? 'markdown' : 'all')
            : this.configService.getFilterMode();
        const sortOrder = this.configService.getSortOrder();
        const showHiddenFiles = this.configService.getShowHiddenFiles();
        const key = folders.map(f => f.uri.toString()).sort().join('\0') + '\0' + sortOrder + '\0' + filterMode + '\0' + String(showHiddenFiles);
        const now = Date.now();
        if (this.flatListCache !== null && this.flatListCache.key === key && (now - this.flatListCache.timestamp) < FLAT_LIST_CACHE_TTL_MS) {
            return this.flatListCache.result.map(item => ({ ...item }));
        }

        const markdownExtensions = this.configService.getMarkdownExtensions();
        const collected: { uri: vscode.Uri; name: string; mtime: number; ctime: number }[] = [];

        const collectFromDir = async (dirPath: string): Promise<void> => {
            try {
                const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') {
                        continue;
                    }
                    if (entry.isDirectory() && entry.name === '.git') {
                        continue;
                    }
                    if (!showHiddenFiles && entry.name.startsWith('.')) {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        await collectFromDir(fullPath);
                    } else if (entry.isFile()) {
                        if (filterMode === 'markdown' && !isMarkdownFile(entry.name, markdownExtensions)) {
                            continue;
                        }
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

        const result = collected.map(({ uri, name }) => ({
            uri,
            type: 'file' as const,
            name
        }));
        this.flatListCache = { key, result, timestamp: Date.now() };
        return result;
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
