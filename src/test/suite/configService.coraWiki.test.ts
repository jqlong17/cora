import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    ConfigService,
    CORA_WIKI_PROVIDER_PRESETS,
    type CoraWikiProviderId
} from '../../services/configService';
import { CONFIG_KEYS } from '../../utils/constants';

suite('ConfigService CoraWiki presets Test Suite', () => {
    test('CORA_WIKI_PROVIDER_PRESETS has all four providers with baseUrl, model, apiKeyEnvName', () => {
        const providers: CoraWikiProviderId[] = ['openai', 'kimi', 'openrouter', 'minimax'];
        for (const p of providers) {
            assert.ok(CORA_WIKI_PROVIDER_PRESETS[p], `preset for ${p}`);
            const preset = CORA_WIKI_PROVIDER_PRESETS[p];
            assert.strictEqual(typeof preset.baseUrl, 'string');
            assert.strictEqual(typeof preset.model, 'string');
            assert.strictEqual(typeof preset.apiKeyEnvName, 'string');
            assert.ok(preset.baseUrl.length > 0);
            assert.ok(preset.model.length > 0);
            assert.ok(preset.apiKeyEnvName.length > 0);
        }
    });

    test('getCoraWikiBaseUrl/Model/ApiKeyEnvName return preset after applyCoraWikiProviderPreset per provider', async () => {
        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const originalProvider = config.get<string>(CONFIG_KEYS.CORA_WIKI_PROVIDER);

        try {
            const service = new ConfigService();
            for (const provider of ['kimi', 'openrouter', 'minimax', 'openai'] as CoraWikiProviderId[]) {
                await config.update(CONFIG_KEYS.CORA_WIKI_PROVIDER, provider, true);
                service.reload();
                await service.applyCoraWikiProviderPreset();
                service.reload();
                const preset = CORA_WIKI_PROVIDER_PRESETS[provider];
                assert.strictEqual(
                    service.getCoraWikiBaseUrl(),
                    preset.baseUrl,
                    `baseUrl for ${provider}`
                );
                assert.strictEqual(
                    service.getCoraWikiModel(),
                    preset.model,
                    `model for ${provider}`
                );
                assert.strictEqual(
                    service.getCoraWikiApiKeyEnvName(),
                    preset.apiKeyEnvName,
                    `apiKeyEnvName for ${provider}`
                );
            }
        } finally {
            if (originalProvider !== undefined) {
                await config.update(CONFIG_KEYS.CORA_WIKI_PROVIDER, originalProvider, true);
            }
        }
    });

    test('applyCoraWikiProviderPreset writes preset for current provider', async () => {
        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const originalProvider = config.get<string>(CONFIG_KEYS.CORA_WIKI_PROVIDER);
        const originalBaseUrl = config.get<string>(CONFIG_KEYS.CORA_WIKI_BASE_URL);
        const originalModel = config.get<string>(CONFIG_KEYS.CORA_WIKI_MODEL);
        const originalApiKeyEnvName = config.get<string>(CONFIG_KEYS.CORA_WIKI_API_KEY_ENV_NAME);

        try {
            await config.update(CONFIG_KEYS.CORA_WIKI_PROVIDER, 'kimi', true);
            const service = new ConfigService();
            await service.applyCoraWikiProviderPreset();
            service.reload();
            const preset = CORA_WIKI_PROVIDER_PRESETS.kimi;
            assert.strictEqual(service.getCoraWikiBaseUrl(), preset.baseUrl);
            assert.strictEqual(service.getCoraWikiModel(), preset.model);
            assert.strictEqual(service.getCoraWikiApiKeyEnvName(), preset.apiKeyEnvName);
        } finally {
            await config.update(CONFIG_KEYS.CORA_WIKI_PROVIDER, originalProvider ?? 'openai', true);
            if (originalBaseUrl !== undefined) {
                await config.update(CONFIG_KEYS.CORA_WIKI_BASE_URL, originalBaseUrl, true);
            }
            if (originalModel !== undefined) {
                await config.update(CONFIG_KEYS.CORA_WIKI_MODEL, originalModel, true);
            }
            if (originalApiKeyEnvName !== undefined) {
                await config.update(CONFIG_KEYS.CORA_WIKI_API_KEY_ENV_NAME, originalApiKeyEnvName, true);
            }
        }
    });
});
