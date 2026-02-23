import * as vscode from 'vscode';
import { OutlineService } from '../services/outlineService';
import { ConfigService } from '../services/configService';
import { Heading } from '../utils/constants';
import { isMarkdownFile } from '../utils/markdownParser';

export class OutlineItem extends vscode.TreeItem {
    constructor(
        public readonly heading: Heading
    ) {
        super(heading.text, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `H${heading.level}: ${heading.text}`;
        this.description = `H${heading.level}`;
        this.command = {
            command: 'knowledgeBase.gotoHeading',
            title: '跳转到标题',
            arguments: [heading.line]
        };

        // Set icon based on heading level
        this.iconPath = new vscode.ThemeIcon(`symbol-number`);

        // Set context value for styling
        this.contextValue = `heading-${heading.level}`;

        // Add indentation through description or label
        const indent = '  '.repeat(heading.level - 1);
        this.label = `${indent}${heading.text}`;
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

    async getChildren(): Promise<OutlineItem[]> {
        if (this.currentHeadings.length === 0) {
            return [];
        }

        return this.currentHeadings.map(heading => new OutlineItem(heading));
    }

    getCurrentEditor(): vscode.TextEditor | undefined {
        return this.currentEditor;
    }
}
