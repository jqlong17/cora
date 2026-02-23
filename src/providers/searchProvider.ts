import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileService } from '../services/fileService';
import { ConfigService } from '../services/configService';
import { isMarkdownFile } from '../utils/markdownParser';

export interface SearchResult {
    uri: vscode.Uri;
    fileName: string;
    matchCount: number;
    preview: string;
}

export class SearchItem extends vscode.TreeItem {
    constructor(
        public readonly result: SearchResult
    ) {
        super(result.fileName, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${result.fileName}\n匹配次数: ${result.matchCount}\n${result.preview}`;
        this.description = `${result.matchCount} 处匹配`;
        this.iconPath = new vscode.ThemeIcon('file');

        this.command = {
            command: 'knowledgeBase.openEditor',
            title: '打开文件',
            arguments: [result.uri]
        };
    }
}

export type SearchTreeItem = SearchItem | vscode.TreeItem;

export class SearchProvider implements vscode.TreeDataProvider<SearchTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SearchTreeItem | undefined | null | void> = new vscode.EventEmitter<SearchTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SearchTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private searchResults: SearchResult[] = [];
    private lastQuery: string = '';
    private isFallbackMode: boolean = false;

    constructor(
        private fileService: FileService,
        private configService: ConfigService
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.searchResults = [];
        this.lastQuery = '';
        this.isFallbackMode = false;
        this.refresh();
    }

    getTreeItem(element: SearchTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<SearchTreeItem[]> {
        const items: SearchTreeItem[] = [];

        // 创建搜索输入项
        const inputItem = new vscode.TreeItem(
            this.lastQuery || '🔍 点击输入搜索关键词...',
            vscode.TreeItemCollapsibleState.None
        );
        inputItem.tooltip = this.lastQuery
            ? `当前搜索: "${this.lastQuery}"\n点击进行新搜索`
            : '点击输入搜索关键词\n支持：单个关键词 或 多个关键词（空格分隔）';
        inputItem.description = this.lastQuery ? '点击修改搜索词' : '';
        inputItem.iconPath = new vscode.ThemeIcon('search');
        inputItem.command = {
            command: 'knowledgeBase.searchNotes',
            title: '搜索笔记',
            arguments: []
        };
        items.push(inputItem);

        if (this.searchResults.length === 0) {
            // 如果没有结果，只显示搜索输入项
            return items;
        }

        // 添加搜索结果
        for (const result of this.searchResults) {
            items.push(new SearchItem(result));
        }

        // 添加清除结果项
        const clearItem = new vscode.TreeItem(
            '🗑️ 清除搜索结果',
            vscode.TreeItemCollapsibleState.None
        );
        clearItem.tooltip = '清除当前搜索结果';
        clearItem.iconPath = new vscode.ThemeIcon('clear-all');
        clearItem.command = {
            command: 'knowledgeBase.clearSearch',
            title: '清除搜索',
            arguments: []
        };
        items.push(clearItem);

        return items;
    }

    async search(query: string): Promise<void> {
        if (!query.trim()) {
            this.clear();
            return;
        }

        this.lastQuery = query.trim();
        const keywords = this.lastQuery.split(/\s+/).filter(k => k.length > 0);

        if (keywords.length === 0) {
            this.clear();
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('请先打开一个工作区');
            return;
        }

        const results = await this.performSearch(workspaceFolders[0].uri.fsPath, keywords);

        // 如果没有结果且是多关键词搜索，尝试降级为 OR 搜索
        if (results.length === 0 && keywords.length > 1) {
            const fallbackResults = await this.performOrSearch(workspaceFolders[0].uri.fsPath, keywords);
            if (fallbackResults.length > 0) {
                this.isFallbackMode = true;
                this.searchResults = fallbackResults;
                vscode.window.showInformationMessage(
                    `未找到同时包含所有关键词的文件，显示包含任一关键词的 ${fallbackResults.length} 个结果`
                );
            } else {
                this.isFallbackMode = false;
                this.searchResults = [];
                vscode.window.showInformationMessage('未找到匹配的笔记');
            }
        } else {
            this.isFallbackMode = false;
            this.searchResults = results;
            if (results.length === 0) {
                vscode.window.showInformationMessage('未找到匹配的笔记');
            }
        }

        this.refresh();
    }

    private async performSearch(rootPath: string, keywords: string[]): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const markdownExtensions = this.configService.getMarkdownExtensions();

        const files = await this.getAllMarkdownFiles(rootPath, markdownExtensions);

        for (const filePath of files) {
            try {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const lowerContent = content.toLowerCase();

                // 检查是否包含所有关键词（AND 逻辑）
                const allMatch = keywords.every(keyword =>
                    lowerContent.includes(keyword.toLowerCase())
                );

                if (allMatch) {
                    const matchCount = this.countMatches(content, keywords);
                    const preview = this.generatePreview(content, keywords);

                    results.push({
                        uri: vscode.Uri.file(filePath),
                        fileName: path.basename(filePath),
                        matchCount,
                        preview
                    });
                }
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
            }
        }

        // 按匹配次数排序
        return results.sort((a, b) => b.matchCount - a.matchCount);
    }

    private async performOrSearch(rootPath: string, keywords: string[]): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const markdownExtensions = this.configService.getMarkdownExtensions();

        const files = await this.getAllMarkdownFiles(rootPath, markdownExtensions);

        for (const filePath of files) {
            try {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const lowerContent = content.toLowerCase();

                // 检查是否包含任一关键词（OR 逻辑）
                const anyMatch = keywords.some(keyword =>
                    lowerContent.includes(keyword.toLowerCase())
                );

                if (anyMatch) {
                    const matchCount = this.countMatches(content, keywords);
                    const preview = this.generatePreview(content, keywords);

                    results.push({
                        uri: vscode.Uri.file(filePath),
                        fileName: path.basename(filePath),
                        matchCount,
                        preview
                    });
                }
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
            }
        }

        return results.sort((a, b) => b.matchCount - a.matchCount);
    }

    private async getAllMarkdownFiles(dir: string, extensions: string[]): Promise<string[]> {
        const files: string[] = [];

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // 跳过隐藏文件和文件夹
            if (entry.name.startsWith('.')) {
                continue;
            }

            // 跳过 node_modules 和 out 等常见构建目录
            if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') {
                continue;
            }

            if (entry.isDirectory()) {
                const subFiles = await this.getAllMarkdownFiles(fullPath, extensions);
                files.push(...subFiles);
            } else if (entry.isFile() && isMarkdownFile(entry.name, extensions)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    private countMatches(content: string, keywords: string[]): number {
        let count = 0;
        const lowerContent = content.toLowerCase();

        for (const keyword of keywords) {
            const regex = new RegExp(keyword.toLowerCase(), 'g');
            const matches = lowerContent.match(regex);
            if (matches) {
                count += matches.length;
            }
        }

        return count;
    }

    private generatePreview(content: string, keywords: string[]): string {
        const lines = content.split('\n');

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            const hasMatch = keywords.some(keyword =>
                lowerLine.includes(keyword.toLowerCase())
            );

            if (hasMatch && line.trim().length > 0) {
                // 截取前 50 个字符作为预览
                return line.trim().substring(0, 50) + (line.length > 50 ? '...' : '');
            }
        }

        return '';
    }

    getLastQuery(): string {
        return this.lastQuery;
    }

    isFallback(): boolean {
        return this.isFallbackMode;
    }
}
