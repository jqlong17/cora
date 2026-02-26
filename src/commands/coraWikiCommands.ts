import * as vscode from 'vscode';
import { runCoraWikiResearch } from '../corawiki';
import { CoraWikiProvider } from '../providers/coraWikiProvider';
import { t } from '../utils/i18n';

export async function startCoraWikiResearch(provider: CoraWikiProvider): Promise<void> {
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
            const result = await runCoraWikiResearch(query.trim(), workspace.uri.fsPath);
            provider.setResult(result);

            const output = vscode.window.createOutputChannel('CoraWiki');
            output.clear();
            output.appendLine(`Query: ${result.query}`);
            output.appendLine(`Plan: ${result.plan}`);
            for (const update of result.updates) {
                output.appendLine(`- ${update}`);
            }
            output.appendLine(`Final: ${result.finalConclusion}`);
            output.show(true);
        }
    );
}

