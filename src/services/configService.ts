import * as vscode from 'vscode';
import { FilterMode, CONFIG_KEYS, DEFAULT_MARKDOWN_EXTENSIONS } from '../utils/constants';

export class ConfigService {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('knowledgeBase');
    }

    reload(): void {
        this.config = vscode.workspace.getConfiguration('knowledgeBase');
    }

    getFilterMode(): FilterMode {
        return this.config.get<FilterMode>(CONFIG_KEYS.FILTER_MODE, 'markdown');
    }

    async setFilterMode(mode: FilterMode): Promise<void> {
        await this.config.update(CONFIG_KEYS.FILTER_MODE, mode, true);
    }

    getMarkdownExtensions(): string[] {
        return this.config.get<string[]>(CONFIG_KEYS.MARKDOWN_EXTENSIONS, DEFAULT_MARKDOWN_EXTENSIONS);
    }

    getPreviewOnClick(): boolean {
        return this.config.get<boolean>(CONFIG_KEYS.PREVIEW_ON_CLICK, true);
    }

    getAutoReveal(): boolean {
        return this.config.get<boolean>(CONFIG_KEYS.AUTO_REVEAL, true);
    }

    getShowOutlineForNonMarkdown(): boolean {
        return this.config.get<boolean>(CONFIG_KEYS.SHOW_OUTLINE_FOR_NON_MARKDOWN, false);
    }
}
