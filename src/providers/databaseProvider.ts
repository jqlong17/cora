import * as vscode from 'vscode';

export class DatabaseItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = description || label;
        this.iconPath = new vscode.ThemeIcon('database');
    }
}

export class DatabaseProvider implements vscode.TreeDataProvider<DatabaseItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseItem | undefined | null | void> = new vscode.EventEmitter<DatabaseItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<DatabaseItem[]> {
        // MVP: Return placeholder items indicating future functionality
        return [
            new DatabaseItem('数据库视图开发中...', '即将推出'),
            new DatabaseItem('计划功能:', ''),
            new DatabaseItem('  • 表格视图', '以表格形式展示 Markdown 文件'),
            new DatabaseItem('  • 看板视图', '按状态分组展示'),
            new DatabaseItem('  • Frontmatter 编辑', '快速编辑文件属性'),
            new DatabaseItem('  • 筛选排序', '多维度筛选和排序'),
        ];
    }
}
