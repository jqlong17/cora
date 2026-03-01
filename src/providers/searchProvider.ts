import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '../services/configService';
import { isMarkdownFile } from '../utils/markdownParser';
import { t } from '../utils/i18n';

export interface SearchResult {
    uri: vscode.Uri;
    fileName: string;
    matchCount: number;
    preview: string;
    firstMatchLine?: number;
    titleMatch: boolean;
}

export class SearchProvider {
    private lastQuery: string = '';

    constructor(
        private configService: ConfigService
    ) { }

    async search(query: string): Promise<SearchResult[]> {
        if (!query.trim()) {
            this.lastQuery = '';
            return [];
        }

        this.lastQuery = query.trim();
        const keywords = this.lastQuery.split(/\s+/).filter(k => k.length > 0);

        if (keywords.length === 0) {
            return [];
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage(t('msg.noWorkspace'));
            return [];
        }

        const results = await this.performSearch(workspaceFolders[0].uri.fsPath, keywords);

        if (results.length === 0 && keywords.length > 1) {
            return this.performOrSearch(workspaceFolders[0].uri.fsPath, keywords);
        }

        return results;
    }

    private async performSearch(rootPath: string, keywords: string[]): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const markdownExtensions = this.configService.getMarkdownExtensions();

        const files = await this.getAllMarkdownFiles(rootPath, markdownExtensions);

        for (const filePath of files) {
            try {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const lowerContent = content.toLowerCase();

                const allMatch = keywords.every(keyword =>
                    lowerContent.includes(keyword.toLowerCase())
                );

                if (allMatch) {
                    const matchCount = this.countMatches(content, keywords);
                    const { preview, line } = this.generatePreviewAndLine(content, keywords);
                    const titleMatch = this.isTitleMatch(filePath, keywords);

                    results.push({
                        uri: vscode.Uri.file(filePath),
                        fileName: path.basename(filePath),
                        matchCount,
                        preview,
                        firstMatchLine: line,
                        titleMatch
                    });
                }
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
            }
        }

        return results.sort((a, b) => {
            if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
            return b.matchCount - a.matchCount;
        });
    }

    private async performOrSearch(rootPath: string, keywords: string[]): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const markdownExtensions = this.configService.getMarkdownExtensions();

        const files = await this.getAllMarkdownFiles(rootPath, markdownExtensions);

        for (const filePath of files) {
            try {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const lowerContent = content.toLowerCase();

                const anyMatch = keywords.some(keyword =>
                    lowerContent.includes(keyword.toLowerCase())
                );

                if (anyMatch) {
                    const matchCount = this.countMatches(content, keywords);
                    const { preview, line } = this.generatePreviewAndLine(content, keywords);
                    const titleMatch = this.isTitleMatch(filePath, keywords);

                    results.push({
                        uri: vscode.Uri.file(filePath),
                        fileName: path.basename(filePath),
                        matchCount,
                        preview,
                        firstMatchLine: line,
                        titleMatch
                    });
                }
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
            }
        }

        return results.sort((a, b) => {
            if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
            return b.matchCount - a.matchCount;
        });
    }

    private async getAllMarkdownFiles(dir: string, extensions: string[]): Promise<string[]> {
        const files: string[] = [];
        const showHiddenFiles = this.configService.getShowHiddenFiles();

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && entry.name === '.git') {
                continue;
            }

            if (!showHiddenFiles && entry.name.startsWith('.')) {
                continue;
            }

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

    private isTitleMatch(filePath: string, keywords: string[]): boolean {
        const nameWithoutExt = path.basename(filePath, path.extname(filePath)).toLowerCase();
        return keywords.some(k => nameWithoutExt.includes(k.toLowerCase()));
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
                const preview = line.trim().substring(0, 50) + (line.length > 50 ? '...' : '');
                return { preview, line: i };
            }
        }

        return { preview: '', line: 0 };
    }

    getLastQuery(): string {
        return this.lastQuery;
    }
}
