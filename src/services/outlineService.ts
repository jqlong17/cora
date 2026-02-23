import * as vscode from 'vscode';
import { Heading } from '../utils/constants';
import { parseHeadings } from '../utils/markdownParser';

export class OutlineService {
    private cache: Map<string, Heading[]> = new Map();

    async getHeadings(document: vscode.TextDocument): Promise<Heading[]> {
        const key = document.uri.toString();

        // Check if we have a cached version
        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const content = document.getText();
        const headings = parseHeadings(content);

        this.cache.set(key, headings);
        return headings;
    }

    async getHeadingsFromContent(content: string): Promise<Heading[]> {
        return parseHeadings(content);
    }

    invalidateCache(uri: vscode.Uri): void {
        this.cache.delete(uri.toString());
    }

    clearCache(): void {
        this.cache.clear();
    }

    getHeadingIcon(level: number): string {
        switch (level) {
            case 1: return '$(symbol-key)';
            case 2: return '$(symbol-enum)';
            case 3: return '$(symbol-field)';
            case 4: return '$(symbol-variable)';
            case 5: return '$(symbol-constant)';
            case 6: return '$(symbol-property)';
            default: return '$(symbol-string)';
        }
    }
}
