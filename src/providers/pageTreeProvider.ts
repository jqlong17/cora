import * as vscode from 'vscode';
import { FileService, FileItem } from '../services/fileService';
import { ConfigService } from '../services/configService';
import { getFileIcon } from '../utils/markdownParser';

export class PageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly item: FileItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(item.name, collapsibleState);

        this.tooltip = item.uri.fsPath;
        this.resourceUri = item.uri;

        if (item.type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
            // Use vscode.open to let VS Code choose the appropriate editor
            // This will use our Custom Editor for markdown files
            this.command = {
                command: 'vscode.open',
                title: '打开文件',
                arguments: [item.uri]
            };
            this.contextValue = 'file';
       } else {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'folder';
        }

        // Add description showing relative path for root folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 1) {
            const folder = workspaceFolders.find(f => item.uri.fsPath.startsWith(f.uri.fsPath));
            if (folder) {
                this.description = folder.name;
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
        private configService: ConfigService
    ) {}

    setTreeView(treeView: vscode.TreeView<PageTreeItem>): void {
        this.treeView = treeView;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PageTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PageTreeItem): Promise<PageTreeItem[]> {
        const items = await this.fileService.getChildren(element?.item);

        return items.map(item => {
            const collapsibleState = item.type === 'directory'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;

            return new PageTreeItem(item, collapsibleState);
        });
    }

    async getParent(element: PageTreeItem): Promise<PageTreeItem | null> {
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
        // For now, this is a placeholder for future implementation
        vscode.window.showInformationMessage('全部展开功能将在后续版本优化');
    }
}
