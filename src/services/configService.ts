import * as vscode from 'vscode';
import { FilterMode, PageViewMode, SortOrder, CONFIG_KEYS, DEFAULT_MARKDOWN_EXTENSIONS } from '../utils/constants';

export type CoraWikiProviderId = 'kimi' | 'openai' | 'openrouter' | 'minimax';

export const CORA_WIKI_PROVIDER_PRESETS: Record<
    CoraWikiProviderId,
    { baseUrl: string; model: string; apiKeyEnvName: string }
> = {
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKeyEnvName: 'OPENAI_API_KEY'
    },
    kimi: {
        baseUrl: 'https://api.moonshot.ai/v1',
        model: 'moonshot-v1-8k',
        apiKeyEnvName: 'KIMI_API_KEY'
    },
    openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o-mini',
        apiKeyEnvName: 'OPENROUTER_API_KEY'
    },
    minimax: {
        baseUrl: 'https://api.minimaxi.com/anthropic',
        model: 'MiniMax-M2.5',
        apiKeyEnvName: 'MINIMAX_API_KEY'
    }
};

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

    getShowHiddenFiles(): boolean {
        return this.config.get<boolean>(CONFIG_KEYS.SHOW_HIDDEN_FILES, false);
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

    getCoraWikiProvider(): 'kimi' | 'openai' | 'openrouter' | 'minimax' {
        return this.config.get<'kimi' | 'openai' | 'openrouter' | 'minimax'>(CONFIG_KEYS.CORA_WIKI_PROVIDER, 'openai');
    }

    getCoraWikiBaseUrl(): string {
        const provider = this.getCoraWikiProvider();
        const preset = CORA_WIKI_PROVIDER_PRESETS[provider];
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_BASE_URL, preset.baseUrl);
    }

    getCoraWikiModel(): string {
        const provider = this.getCoraWikiProvider();
        const preset = CORA_WIKI_PROVIDER_PRESETS[provider];
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_MODEL, preset.model);
    }

    getCoraWikiApiKeyEnvName(): string {
        const provider = this.getCoraWikiProvider();
        const preset = CORA_WIKI_PROVIDER_PRESETS[provider];
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_API_KEY_ENV_NAME, preset.apiKeyEnvName);
    }

    /** 根据当前选择的提供商，将 baseUrl / model / apiKeyEnvName 写回为该提供商的预设值。在用户切换 provider 时调用。 */
    async applyCoraWikiProviderPreset(): Promise<void> {
        const provider = this.getCoraWikiProvider();
        const preset = CORA_WIKI_PROVIDER_PRESETS[provider];
        const config = vscode.workspace.getConfiguration('knowledgeBase');
        await config.update(CONFIG_KEYS.CORA_WIKI_BASE_URL, preset.baseUrl, true);
        await config.update(CONFIG_KEYS.CORA_WIKI_MODEL, preset.model, true);
        await config.update(CONFIG_KEYS.CORA_WIKI_API_KEY_ENV_NAME, preset.apiKeyEnvName, true);
        this.reload();
    }

    getCoraWikiFallbackProvider(): 'openai' | 'openrouter' | 'kimi' | 'minimax' {
        return this.config.get<'openai' | 'openrouter' | 'kimi' | 'minimax'>(CONFIG_KEYS.CORA_WIKI_FALLBACK_PROVIDER, 'openai');
    }

    getCoraWikiMaxSteps(): number {
        return this.config.get<number>(CONFIG_KEYS.CORA_WIKI_MAX_STEPS, 15);
    }

    getCoraWikiMaxTotalTokens(): number {
        return this.config.get<number>(CONFIG_KEYS.CORA_WIKI_MAX_TOTAL_TOKENS, 100000);
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

    getCoraWikiPythonToolingEnabled(): boolean {
        return this.config.get<boolean>(CONFIG_KEYS.CORA_WIKI_PYTHON_TOOLING_ENABLED, true);
    }

    getCoraWikiPythonPath(): string {
        return this.config.get<string>(CONFIG_KEYS.CORA_WIKI_PYTHON_PATH, 'python3');
    }
}
