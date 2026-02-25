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
    firstMatchLine?: number;
}

export class SearchItem extends vscode.TreeItem {
    constructor(
        public readonly result: SearchResult
    ) {
        super(result.fileName, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${result.fileName}\n匹配次数: ${result.matchCount}\n${result.preview}`;
        this.description = `${result.matchCount} 处匹配`;
        this.iconPath = new vscode.ThemeIcon('file');

        // 使用 knowledgeBase.openPreview 以提供统一的双模编辑器体验
        this.command = {
            command: 'knowledgeBase.openPreview',
            title: '打开预览',
            arguments: [result.uri, result.firstMatchLine]
        };
    }
}

export class SearchProvider implements vscode.TreeDataProvider<SearchItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SearchItem | undefined | null | void> = new vscode.EventEmitter<SearchItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SearchItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private searchResults: SearchResult[] = [];
    private lastQuery: string = '';
    private isFallbackMode: boolean = false;

    constructor(
        private fileService: FileService,
        private configService: ConfigService
    ) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.searchResults = [];
        this.lastQuery = '';
        this.isFallbackMode = false;
        this.refresh();
    }

    getTreeItem(element: SearchItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<SearchItem[]> {
        // 只返回搜索结果，搜索和清除功能在标题栏
        return this.searchResults.map(result => new SearchItem(result));
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
                    const { preview, line } = this.generatePreviewAndLine(content, keywords);

                    results.push({
                        uri: vscode.Uri.file(filePath),
                        fileName: path.basename(filePath),
                        matchCount,
                        preview,
                        firstMatchLine: line
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
                    const { preview, line } = this.generatePreviewAndLine(content, keywords);

                    results.push({
                        uri: vscode.Uri.file(filePath),
                        fileName: path.basename(filePath),
                        matchCount,
                        preview,
                        firstMatchLine: line
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

    private generatePreviewAndLine(content: string, keywords: string[]): { preview: string, line: number } {
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lowerLine = line.toLowerCase();
            const hasMatch = keywords.some(keyword =>
                lowerLine.includes(keyword.toLowerCase())
            );

            if (hasMatch && line.trim().length > 0) {
                // 截取前 50 个字符作为预览
                const preview = line.trim().substring(0, 50) + (line.length > 50 ? '...' : '');
                return { preview, line: i };
            }
        }

        return { preview: '', line: 0 };
    }

    getLastQuery(): string {
        return this.lastQuery;
    }

    isFallback(): boolean {
        return this.isFallbackMode;
    }
}
