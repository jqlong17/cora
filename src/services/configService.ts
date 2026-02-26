import * as vscode from 'vscode';
import { FilterMode, PageViewMode, SortOrder, CONFIG_KEYS, DEFAULT_MARKDOWN_EXTENSIONS } from '../utils/constants';

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

    getPageViewMode(): PageViewMode {
        return this.config.get<PageViewMode>(CONFIG_KEYS.PAGE_VIEW_MODE, 'tree');
    }

    async setPageViewMode(mode: PageViewMode): Promise<void> {
        await this.config.update(CONFIG_KEYS.PAGE_VIEW_MODE, mode, true);
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

    getSortOrder(): SortOrder {
        return this.config.get<SortOrder>(CONFIG_KEYS.SORT_ORDER, 'nameAsc');
    }

    async setSortOrder(order: SortOrder): Promise<void> {
        await this.config.update(CONFIG_KEYS.SORT_ORDER, order, true);
    }

    getCoraWikiProvider(): 'kimi' | 'openai' | 'openrouter' {
        return this.config.get<'kimi' | 'openai' | 'openrouter'>(CONFIG_KEYS.CORA_WIKI_PROVIDER, 'openai');
    }

    getCoraWikiBaseUrl(): string {
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_BASE_URL, 'https://api.openai.com/v1');
    }

    getCoraWikiModel(): string {
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_MODEL, 'gpt-4o-mini');
    }

    getCoraWikiApiKeyEnvName(): string {
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_API_KEY_ENV_NAME, 'OPENAI_API_KEY');
    }

    getCoraWikiFallbackProvider(): 'openai' | 'openrouter' | 'kimi' {
        return this.config.get<'openai' | 'openrouter' | 'kimi'>(CONFIG_KEYS.CORA_WIKI_FALLBACK_PROVIDER, 'openai');
    }

    getCoraWikiMaxSteps(): number {
        return this.config.get<number>(CONFIG_KEYS.CORA_WIKI_MAX_STEPS, 15);
    }

    getCoraWikiInclude(): string[] {
        return this.config.get<string[]>(CONFIG_KEYS.CORA_WIKI_INCLUDE, []);
    }

    getCoraWikiExclude(): string[] {
        return this.config.get<string[]>(CONFIG_KEYS.CORA_WIKI_EXCLUDE, ['.git', 'node_modules', 'dist', 'build']);
    }

    getCoraWikiCacheTtlSec(): number {
        return this.config.get<number>(CONFIG_KEYS.CORA_WIKI_CACHE_TTL_SEC, 30);
    }
}
