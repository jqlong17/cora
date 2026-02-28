import * as vscode from 'vscode';
import * as path from 'path';
import { FileService, FileItem } from '../services/fileService';
import { ConfigService } from '../services/configService';
import { FavoritesService } from '../services/favoritesService';
import { isMarkdownFile } from '../utils/markdownParser';
import { t } from '../utils/i18n';
import { DEFAULT_MARKDOWN_EXTENSIONS } from '../utils/constants';

export class PageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly item: FileItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        descriptionOverride?: string,
        markdownExtensions?: string[]
    ) {
        super(item.name, collapsibleState);

        this.tooltip = item.uri.fsPath;
        this.resourceUri = item.uri;

        if (item.type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
            const isMarkdown = isMarkdownFile(item.name, markdownExtensions ?? DEFAULT_MARKDOWN_EXTENSIONS);
            this.command = isMarkdown
                ? { command: 'knowledgeBase.openPreview', title: t('common.openPreview'), arguments: [item.uri] }
                : { command: 'vscode.open', title: t('common.openFile'), arguments: [item.uri] };
            this.contextValue = 'file';
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'folder';
        }

        // Add description showing relative path for root folders (or use override for flat view)
        if (descriptionOverride !== undefined) {
            this.description = descriptionOverride;
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 1) {
                const folder = workspaceFolders.find(f => item.uri.fsPath.startsWith(f.uri.fsPath));
                if (folder) {
                    this.description = folder.name;
                }
            }
        }
    }
}

export class PageTreeProvider implements vscode.TreeDataProvider<PageTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PageTreeItem | undefined | null | void> = new vscode.EventEmitter<PageTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PageTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private treeView: vscode.TreeView<PageTreeItem> | undefined;

    constructor(
        private fileService: FileService,
        private configService: ConfigService,
        private favoritesService?: FavoritesService
    ) { }

    setTreeView(treeView: vscode.TreeView<PageTreeItem>): void {
        this.treeView = treeView;
    }

    refresh(): void {
        this.fileService.clearFlatListCache();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PageTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PageTreeItem): Promise<PageTreeItem[]> {
        const pageViewMode = this.configService.getPageViewMode();
        const filterMode = this.configService.getFilterMode();
        const filterMarkdownOnly = filterMode === 'markdown';

        if (pageViewMode === 'favorites' && this.favoritesService) {
            if (element !== undefined) return [];
            const uriStrings = this.favoritesService.getFavorites();
            const folders = this.fileService.getWorkspaceFolders();
            const markdownExtensions = this.configService.getMarkdownExtensions();
            const sortOrder = this.configService.getSortOrder();
            const withStat: { uri: vscode.Uri; name: string; mtime: number; ctime: number }[] = [];
            for (const uriStr of uriStrings) {
                try {
                    const uri = vscode.Uri.parse(uriStr);
                    const stat = await vscode.workspace.fs.stat(uri);
                    const name = path.basename(uri.fsPath);
                    if (filterMarkdownOnly && !isMarkdownFile(name, markdownExtensions)) {
                        continue;
                    }
                    withStat.push({
                        uri,
                        name,
                        mtime: stat.mtime,
                        ctime: stat.ctime
                    });
                } catch {
                    // 文件已删除，跳过
                }
            }
            withStat.sort((a, b) => {
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
            const items: PageTreeItem[] = [];
            for (const { uri, name } of withStat) {
                const fileItem: FileItem = { uri, type: 'file', name };
                let descriptionOverride: string | undefined;
                if (folders.length >= 1) {
                    const folder = folders.find(f => uri.fsPath.startsWith(f.uri.fsPath));
                    if (folder) {
                        const rel = path.relative(folder.uri.fsPath, uri.fsPath);
                        if (rel !== name) descriptionOverride = rel;
                    }
                }
                const treeItem = new PageTreeItem(fileItem, vscode.TreeItemCollapsibleState.None, descriptionOverride, markdownExtensions);
                treeItem.contextValue = 'file+favorite';
                treeItem.iconPath = new vscode.ThemeIcon('star-empty');
                items.push(treeItem);
            }
            return items;
        }

        if (pageViewMode === 'flat') {
            if (element !== undefined) {
                return [];
            }
            const markdownExtensions = this.configService.getMarkdownExtensions();
            const items = await this.fileService.getAllFilesSortedByConfig({ filterMarkdownOnly });
            const folders = this.fileService.getWorkspaceFolders();
            return items.map((item: FileItem) => {
                let descriptionOverride: string | undefined;
                if (folders.length >= 1) {
                    const folder = folders.find(f => item.uri.fsPath.startsWith(f.uri.fsPath));
                    if (folder) {
                        const rel = path.relative(folder.uri.fsPath, item.uri.fsPath);
                        if (rel !== item.name) {
                            descriptionOverride = rel;
                        }
                    }
                }
                const treeItem = new PageTreeItem(item, vscode.TreeItemCollapsibleState.None, descriptionOverride, markdownExtensions);
                if (this.favoritesService?.isFavorite(item.uri)) {
                    treeItem.contextValue = 'file+favorite';
                    treeItem.iconPath = new vscode.ThemeIcon('star-empty');
                }
                return treeItem;
            });
        }

        const markdownExtensions = this.configService.getMarkdownExtensions();
        const items = await this.fileService.getChildren(element?.item, { filterMarkdownOnly });
        return items.map(item => {
            const collapsibleState = item.type === 'directory'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
            const treeItem = new PageTreeItem(item, collapsibleState, undefined, markdownExtensions);
            if (item.type === 'file' && this.favoritesService?.isFavorite(item.uri)) {
                treeItem.contextValue = 'file+favorite';
                treeItem.iconPath = new vscode.ThemeIcon('star-empty');
            }
            return treeItem;
        });
    }

    async getParent(element: PageTreeItem): Promise<PageTreeItem | null> {
        const pageViewMode = this.configService.getPageViewMode();
        if (pageViewMode === 'flat' || pageViewMode === 'favorites') {
            return null;
        }
        const parentPath = element.item.uri.fsPath.split('/').slice(0, -1).join('/');
        if (!parentPath) {
            return null;
        }

        const parentUri = vscode.Uri.file(parentPath);
        const parentItem: FileItem = {
            uri: parentUri,
            type: 'directory',
            name: parentPath.split('/').pop() || ''
        };

        return new PageTreeItem(parentItem, vscode.TreeItemCollapsibleState.Expanded);
    }

    async expandAll(): Promise<void> {
        // Note: VS Code TreeView API doesn't support programmatic expansion of all nodes
        // This would require tracking all visible nodes and calling reveal on each
        // Placeholder for future implementation; no toast to avoid noise
    }
}
