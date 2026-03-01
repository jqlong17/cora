import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { checkPythonAvailable, CORAWIKI_CANCELLED, findLatestReportPath, renderMarkdownReport, runCoraWikiResearch, saveReport } from '../corawiki';
import { CoraWikiItem, CoraWikiProvider } from '../providers/coraWikiProvider';
import type { PreviewProvider } from '../providers/previewProvider';
import { ConfigService } from '../services/configService';
import { t } from '../utils/i18n';

const CONTEXT_CORAWIKI_RUNNING = 'corawikiResearchRunning';
let coraWikiResearchRunning = false;

function getDefaultArchitectureQuery(workspacePath: string): string {
    return `分析下 ${workspacePath} 的整体架构并生成报告`;
}

export async function startCoraWikiResearch(
    provider: CoraWikiProvider,
    configService: ConfigService,
    presetQuery?: string,
    extensionPath?: string
): Promise<void> {
    if (coraWikiResearchRunning) {
        vscode.window.showWarningMessage(t('coraWiki.alreadyRunning'));
        return;
    }

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }

    const query = presetQuery ?? await vscode.window.showInputBox({
        prompt: t('coraWiki.queryPrompt'),
        placeHolder: t('coraWiki.queryPlaceholder')
    });

    if (!query || !query.trim()) {
        return;
    }

    const output = vscode.window.createOutputChannel('CoraWiki');
    output.clear();
    output.appendLine(`[${new Date().toLocaleTimeString()}] CoraWiki run started`);

    coraWikiResearchRunning = true;
    void vscode.commands.executeCommand('setContext', CONTEXT_CORAWIKI_RUNNING, true);

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: t('coraWiki.running'),
                cancellable: true
            },
            async (progress, token) => {
                const abortController = new AbortController();
                token.onCancellationRequested(() => abortController.abort());

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

                let enablePythonTooling = configService.getCoraWikiPythonToolingEnabled();
                if (enablePythonTooling && extensionPath) {
                    const pyCheck = await checkPythonAvailable(extensionPath, configService.getCoraWikiPythonPath());
                    if (!pyCheck.ok) {
                        const skipTitle = t('coraWiki.pythonSkip');
                        const openTitle = t('coraWiki.pythonOpenWebsite');
                        const choice = await vscode.window.showWarningMessage(
                            t('coraWiki.pythonNotFound'),
                            { modal: false },
                            skipTitle,
                            openTitle
                        );
                        if (choice === openTitle) {
                            await vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
                        }
                        enablePythonTooling = false;
                    }
                }

                try {
                    const result = await runCoraWikiResearch(query.trim(), workspace.uri.fsPath, {
                        maxSteps,
                        maxTotalTokens: configService.getCoraWikiMaxTotalTokens(),
                        llmConfig,
                        include: configService.getCoraWikiInclude(),
                        exclude: configService.getCoraWikiExclude(),
                        cacheTtlSec: configService.getCoraWikiCacheTtlSec(),
                        signal: abortController.signal,
                        onProgress: (message: string) => {
                            const short = message.slice(0, 140);
                            progress.report({ message: short });
                            output.appendLine(`[${new Date().toLocaleTimeString()}] ${short}`);
                        },
                        enablePythonTooling,
                        pythonPath: configService.getCoraWikiPythonPath(),
                        extensionPath,
                        onPythonError: async (error: string) => {
                            const skipTitle = t('coraWiki.pythonSkip');
                            const retryTitle = t('coraWiki.pythonRetry');
                            const choice = await vscode.window.showErrorMessage(
                                t('coraWiki.pythonError', { error }),
                                skipTitle,
                                retryTitle
                            );
                            return choice === retryTitle ? 'retry' : 'skip';
                        }
                    });
                    const reportMarkdown = renderMarkdownReport(result, workspace.uri.fsPath);
                    const reportPath = await saveReport(workspace.uri.fsPath, reportMarkdown);
                    provider.setResult(result);
                    provider.setLatestReportPath(reportPath);
                    await provider.refreshReports(workspace.uri.fsPath);

                    output.appendLine(`Provider: ${llmConfig?.provider ?? 'local'}`);
                    output.appendLine(`Model: ${llmConfig?.model ?? 'local-mode'}`);
                    if (result.tokenUsage) {
                        output.appendLine(
                            `Token Usage: prompt=${result.tokenUsage.promptTokens}, completion=${result.tokenUsage.completionTokens}, total=${result.tokenUsage.totalTokens}, cached=${result.tokenUsage.cachedTokens}`
                        );
                    }
                    output.appendLine(`Query: ${result.query}`);
                    output.appendLine(`Plan: ${result.plan}`);
                    for (const update of result.updates) {
                        output.appendLine(`- ${update}`);
                    }
                    output.appendLine(`Final: ${result.finalConclusion}`);
                    output.appendLine(`Report: ${reportPath}`);
                    if (result.debugLogPath) {
                        output.appendLine(`Debug Log: ${result.debugLogPath}`);
                    }
                    output.show(true);
                } catch (error: unknown) {
                    const err = error as { code?: string };
                    if (err?.code === CORAWIKI_CANCELLED) {
                        output.appendLine(`[${new Date().toLocaleTimeString()}] Cancelled by user`);
                    } else {
                        output.appendLine(`[${new Date().toLocaleTimeString()}] Error: ${String(error)}`);
                        output.show(true);
                        vscode.window.showErrorMessage(
                            t('coraWiki.runFailed', { error: String(error) })
                        );
                    }
                }
            }
        );
    } finally {
        coraWikiResearchRunning = false;
        void vscode.commands.executeCommand('setContext', CONTEXT_CORAWIKI_RUNNING, false);
    }
}

export async function startCoraWikiWorkspaceArchitectureResearch(
    provider: CoraWikiProvider,
    configService: ConfigService,
    extensionPath?: string
): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }
    await startCoraWikiResearch(provider, configService, getDefaultArchitectureQuery(workspace.uri.fsPath), extensionPath);
}

export async function openLatestCoraWikiReport(provider: CoraWikiProvider, previewProvider: PreviewProvider): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }
    const reportPath = provider.getLatestReportPath() ?? await findLatestReportPath(workspace.uri.fsPath);
    if (!reportPath) {
        vscode.window.showWarningMessage(t('coraWiki.noReportFound'));
        return;
    }
    try {
        await previewProvider.openPreview(vscode.Uri.file(reportPath));
    } catch (error) {
        vscode.window.showErrorMessage(t('coraWiki.openReportFailed', { error: String(error) }));
    }
}

export async function openCoraWikiReport(reportPath: string, previewProvider: PreviewProvider): Promise<void> {
    try {
        await previewProvider.openPreview(vscode.Uri.file(reportPath));
    } catch (error) {
        vscode.window.showErrorMessage(t('coraWiki.openReportFailed', { error: String(error) }));
    }
}

function getSelectedReportPaths(
    item: CoraWikiItem | undefined,
    coraWikiTreeView: vscode.TreeView<CoraWikiItem> | undefined
): string[] {
    const selected = coraWikiTreeView?.selection?.length
        ? coraWikiTreeView.selection
        : item ? [item] : [];
    const paths: string[] = [];
    for (const node of selected) {
        if (node?.reportPath) {
            paths.push(node.reportPath);
        }
    }
    return paths;
}

export async function deleteCoraWikiReport(
    item: CoraWikiItem | undefined,
    provider: CoraWikiProvider,
    coraWikiTreeView?: vscode.TreeView<CoraWikiItem>
): Promise<void> {
    const reportPaths = getSelectedReportPaths(item, coraWikiTreeView);
    if (reportPaths.length === 0) {
        return;
    }
    const n = reportPaths.length;
    const confirmMsg = n > 1
        ? t('coraWiki.deleteReportConfirmMulti', { n })
        : t('coraWiki.deleteReportConfirm', { name: path.basename(reportPaths[0]) });
    const confirmed = await vscode.window.showWarningMessage(
        confirmMsg,
        { modal: true },
        t('coraWiki.deleteAction')
    );
    if (confirmed !== t('coraWiki.deleteAction')) {
        return;
    }
    let successCount = 0;
    for (const reportPath of reportPaths) {
        try {
            await fs.unlink(reportPath);
            successCount += 1;
        } catch (error) {
            vscode.window.showErrorMessage(t('coraWiki.deleteReportFailed', { error: String(error) }));
        }
    }
    if (successCount > 0) {
        await provider.refreshReports(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
        vscode.window.showInformationMessage(
            n > 1 ? t('coraWiki.deleteReportDoneMulti', { n: successCount }) : t('coraWiki.deleteReportDone')
        );
    }
}

function parseReference(rawRef: string): { filePath: string; line?: number } {
    const lineMatch = /^(.*?):(\d+)(?:-\d+)?$/.exec(rawRef.trim());
    if (!lineMatch) {
        return { filePath: rawRef.trim() };
    }
    return {
        filePath: lineMatch[1],
        line: Number(lineMatch[2])
    };
}

export async function openCoraWikiReference(reference: string): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }

    const parsed = parseReference(reference);
    const resolvedPath = path.isAbsolute(parsed.filePath)
        ? parsed.filePath
        : path.join(workspace.uri.fsPath, parsed.filePath);

    try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath));
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        if (parsed.line && parsed.line > 0) {
            const lineIndex = Math.min(parsed.line - 1, Math.max(0, doc.lineCount - 1));
            const pos = new vscode.Position(lineIndex, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }
    } catch (error) {
        vscode.window.showErrorMessage(t('coraWiki.openReferenceFailed', { ref: reference, error: String(error) }));
    }
}

const CORAWIKI_USAGE_FILENAME = 'corawiki-usage.md';

export async function openCoraWikiUsage(extensionUri: vscode.Uri): Promise<void> {
    const uri = vscode.Uri.joinPath(extensionUri, 'resources', CORAWIKI_USAGE_FILENAME);
    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`${t('msg.openFailed')}: ${message}`);
    }
}

