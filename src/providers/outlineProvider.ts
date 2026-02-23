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
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        this.tooltip = `H${heading.level}: ${heading.text}`;
        this.command = {
            command: 'knowledgeBase.gotoHeading',
            title: '跳转到标题',
            arguments: [heading.line]
        };

        // Set icon based on heading level (using different icons for visual hierarchy)
        const iconMap: Record<number, string> = {
            1: 'symbol-key',      // H1 - key symbol
            2: 'symbol-enum',     // H2 - enum symbol
            3: 'symbol-field',    // H3 - field symbol
            4: 'symbol-variable', // H4 - variable symbol
            5: 'symbol-constant', // H5 - constant symbol
            6: 'symbol-property'  // H6 - property symbol
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[heading.level] || 'symbol-string');

        // Set context value for styling
        this.contextValue = `heading-${heading.level}`;

        // Use description to show level indicator instead of inline text
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

    clear(): void {
        this.currentHeadings = [];
        this.currentEditor = undefined;
        this.refresh();
    }

    async updateForEditor(editor: vscode.TextEditor): Promise<void> {
        const document = editor.document;
        await this.updateForDocument(document, editor);
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

        // Check if we should show outline for this file
        const isMarkdown = isMarkdownFile(document.fileName, markdownExtensions);
        const showNonMarkdown = this.configService.getShowOutlineForNonMarkdown();

        if (!isMarkdown && !showNonMarkdown) {
            this.clear();
            return;
        }

        this.currentEditor = editor;
        this.currentHeadings = await this.outlineService.getHeadings(document);
        this.refresh();

        // Highlight current section based on cursor position
        if (editor) {
            this.highlightCurrentHeading(editor);
        }
    }

    private highlightCurrentHeading(editor: vscode.TextEditor): void {
        const cursorLine = editor.selection.active.line;

        // Find the current heading (the last heading before cursor)
        let currentHeading: Heading | null = null;
        for (const heading of this.currentHeadings) {
            if (heading.line <= cursorLine) {
                currentHeading = heading;
            } else {
                break;
            }
        }

        // Note: VS Code TreeView doesn't have a built-in way to highlight items
        // We could implement this with reveal() if we track the item reference
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: OutlineItem): Promise<OutlineItem[]> {
        if (this.currentHeadings.length === 0) {
            return [];
        }

        // Helper function to check if a heading has children
        const hasChildren = (heading: Heading): boolean => {
            const index = this.currentHeadings.findIndex(h => h.line === heading.line);
            if (index === -1 || index >= this.currentHeadings.length - 1) {
                return false;
            }
            return this.currentHeadings[index + 1].level > heading.level;
        };

        // Build hierarchical structure based on heading levels
        if (!element) {
            // Return all headings that don't have a parent at a higher level
            // (i.e., H1 always shown, H2 only if no H1 before it, etc.)
            // Actually, let's show all headings as a flat list but with proper visual hierarchy
            return this.currentHeadings.map(h => new OutlineItem(h, hasChildren(h)));
        } else {
            // Return children of the current element
            const parentIndex = this.currentHeadings.findIndex(h =>
                h.line === element.heading.line && h.text === element.heading.text
            );

            if (parentIndex === -1) {
                return [];
            }

            const children: OutlineItem[] = [];
            const parentLevel = element.heading.level;

            for (let i = parentIndex + 1; i < this.currentHeadings.length; i++) {
                const heading = this.currentHeadings[i];
                if (heading.level === parentLevel + 1) {
                    children.push(new OutlineItem(heading, hasChildren(heading)));
                } else if (heading.level <= parentLevel) {
                    break;
                }
            }

            return children;
        }
    }

    getCurrentEditor(): vscode.TextEditor | undefined {
        return this.currentEditor;
    }
}
