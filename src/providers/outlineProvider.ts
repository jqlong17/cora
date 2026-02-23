import * as vscode from 'vscode';
import { OutlineService } from '../services/outlineService';
import { ConfigService } from '../services/configService';
import { Heading } from '../utils/constants';
import { isMarkdownFile } from '../utils/markdownParser';

export class OutlineItem extends vscode.TreeItem {
    constructor(
        public readonly heading: Heading,
        hasChildren: boolean = false
    ) {
        super(
            heading.text,
            hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
        );

        this.tooltip = `H${heading.level}: ${heading.text}`;
        this.command = {
            command: 'knowledgeBase.gotoHeading',
            title: '跳转到标题',
            arguments: [heading.line]
        };

        const iconMap: Record<number, string> = {
            1: 'symbol-key',
            2: 'symbol-enum',
            3: 'symbol-field',
            4: 'symbol-variable',
            5: 'symbol-constant',
            6: 'symbol-property'
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[heading.level] || 'symbol-string');
        this.contextValue = `heading-${heading.level}`;
        this.description = `H${heading.level}`;
    }
}

export class OutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private treeView: vscode.TreeView<OutlineItem> | undefined;
    private currentHeadings: Heading[] = [];
    private currentEditor: vscode.TextEditor | undefined;

    constructor(
        private outlineService: OutlineService,
        private configService: ConfigService
    ) {}

    setTreeView(treeView: vscode.TreeView<OutlineItem>): void {
        this.treeView = treeView;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * 全部展开：用 treeView.reveal() 逐根节点展开（expand:5 覆盖 H1~H6 所有层级）。
     * reveal() 要求 getParent() 已实现，否则会静默失败。
     */
    async expandAll(): Promise<void> {
        if (!this.treeView) {
            return;
        }
        // 先 refresh，让 TreeView 用最新数据重建节点
        this.refresh();
        // 等 TreeView 完成本轮渲染
        await new Promise(resolve => setTimeout(resolve, 100));
        const roots = await this.getChildren();
        for (const item of roots) {
            // expand: 5 表示展开该节点及其 5 层后代，足够覆盖 H1~H6
            await this.treeView.reveal(item, { expand: 5, select: false, focus: false });
        }
    }

    clear(): void {
        this.currentHeadings = [];
        this.currentEditor = undefined;
        this.refresh();
    }

    async updateForEditor(editor: vscode.TextEditor): Promise<void> {
        await this.updateForDocument(editor.document, editor);
    }

    async updateForUri(uri: vscode.Uri): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            await this.updateForDocument(document);
        } catch (error) {
            console.error('Error opening document:', error);
            this.clear();
        }
    }

    private async updateForDocument(document: vscode.TextDocument, editor?: vscode.TextEditor): Promise<void> {
        const markdownExtensions = this.configService.getMarkdownExtensions();
        const isMarkdown = isMarkdownFile(document.fileName, markdownExtensions);
        const showNonMarkdown = this.configService.getShowOutlineForNonMarkdown();

        if (!isMarkdown && !showNonMarkdown) {
            this.clear();
            return;
        }

        this.currentEditor = editor;
        this.currentHeadings = await this.outlineService.getHeadings(document);
        this.refresh();
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    /**
     * reveal() 正常工作的必要条件：TreeDataProvider 必须实现 getParent()，
     * 否则 VS Code 无法沿树向上定位节点，reveal() 会静默失败。
     */
    getParent(element: OutlineItem): OutlineItem | undefined {
        const parentMap = this.buildParentMap();
        const idx = this.currentHeadings.findIndex(
            h => h.line === element.heading.line && h.text === element.heading.text
        );
        if (idx === -1) {
            return undefined;
        }
        const parentIdx = parentMap[idx];
        if (parentIdx === -1) {
            return undefined;
        }
        const parentHeading = this.currentHeadings[parentIdx];
        const parentHasChildren = parentMap.some(p => p === parentIdx);
        return new OutlineItem(parentHeading, parentHasChildren);
    }

    async getChildren(element?: OutlineItem): Promise<OutlineItem[]> {
        if (this.currentHeadings.length === 0) {
            return [];
        }

        const parentMap = this.buildParentMap();

        const hasChildrenAt = (idx: number): boolean => {
            return parentMap.some(p => p === idx);
        };

        if (!element) {
            return this.currentHeadings
                .map((h, i) => ({ heading: h, index: i }))
                .filter(({ index }) => parentMap[index] === -1)
                .map(({ heading, index }) => new OutlineItem(heading, hasChildrenAt(index)));
        }

        const parentIdx = this.currentHeadings.findIndex(h =>
            h.line === element.heading.line && h.text === element.heading.text
        );
        if (parentIdx === -1) {
            return [];
        }

        return this.currentHeadings
            .map((h, i) => ({ heading: h, index: i }))
            .filter(({ index }) => parentMap[index] === parentIdx)
            .map(({ heading, index }) => new OutlineItem(heading, hasChildrenAt(index)));
    }

    /**
     * Build a parent index map using a stack.
     * parentMap[i] = index of the nearest preceding heading with a strictly lower level, or -1 if none.
     */
    private buildParentMap(): number[] {
        const parentMap: number[] = [];
        const stack: number[] = [];

        for (let i = 0; i < this.currentHeadings.length; i++) {
            while (stack.length > 0 && this.currentHeadings[stack[stack.length - 1]].level >= this.currentHeadings[i].level) {
                stack.pop();
            }
            parentMap[i] = stack.length > 0 ? stack[stack.length - 1] : -1;
            stack.push(i);
        }

        return parentMap;
    }

    getCurrentEditor(): vscode.TextEditor | undefined {
        return this.currentEditor;
    }
}
