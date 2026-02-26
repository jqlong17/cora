import * as vscode from 'vscode';
import { runCoraWikiResearch } from '../corawiki';
import { CoraWikiProvider } from '../providers/coraWikiProvider';
import { ConfigService } from '../services/configService';
import { t } from '../utils/i18n';

export async function startCoraWikiResearch(provider: CoraWikiProvider, configService: ConfigService): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }

    const query = await vscode.window.showInputBox({
        prompt: t('coraWiki.queryPrompt'),
        placeHolder: t('coraWiki.queryPlaceholder')
    });

    if (!query || !query.trim()) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: t('coraWiki.running'),
            cancellable: false
        },
        async () => {
            const apiKeyEnvName = configService.getCoraWikiApiKeyEnvName();
            const apiKey = process.env[apiKeyEnvName];
            const providerName = configService.getCoraWikiProvider();
            const baseUrl = configService.getCoraWikiBaseUrl();
            const model = configService.getCoraWikiModel();
            const maxSteps = configService.getCoraWikiMaxSteps();

            if (!apiKey) {
                vscode.window.showWarningMessage(
                    t('coraWiki.keyMissing', { env: apiKeyEnvName })
                );
            }

            const llmConfig = apiKey
                ? {
                    provider: providerName,
                    baseUrl,
                    model,
                    apiKey,
                    fallbackProvider: configService.getCoraWikiFallbackProvider(),
                    defaultHeaders: providerName === 'kimi' ? { 'User-Agent': 'KimiCLI/1.5' } : undefined
                }
                : undefined;

            try {
                const result = await runCoraWikiResearch(query.trim(), workspace.uri.fsPath, {
                    maxSteps,
                    llmConfig
                });
                provider.setResult(result);

                const output = vscode.window.createOutputChannel('CoraWiki');
                output.clear();
                output.appendLine(`Provider: ${llmConfig?.provider ?? 'local'}`);
                output.appendLine(`Model: ${llmConfig?.model ?? 'local-mode'}`);
                output.appendLine(`Query: ${result.query}`);
                output.appendLine(`Plan: ${result.plan}`);
                for (const update of result.updates) {
                    output.appendLine(`- ${update}`);
                }
                output.appendLine(`Final: ${result.finalConclusion}`);
                output.show(true);
            } catch (error) {
                vscode.window.showErrorMessage(
                    t('coraWiki.runFailed', { error: String(error) })
                );
            }
        }
    );
}

