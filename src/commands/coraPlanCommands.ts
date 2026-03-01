import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { CoraPlanProvider } from '../providers/coraPlanProvider';
import { t } from '../utils/i18n';

const CONSTRAINTS_FILENAME = '00-PLAN-CONSTRAINTS.md';
const README_FILENAME = 'README.md';
const RULE_FILENAME = 'plan-creation.mdc';
const PLANS_DIR = '.cursor/plans';
const RULES_DIR = '.cursor/rules';

const USAGE_FILENAME = 'coraplan-usage.md';

export async function openCoraPlanUsage(extensionUri: vscode.Uri): Promise<void> {
    const uri = vscode.Uri.joinPath(extensionUri, 'resources', USAGE_FILENAME);
    try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`${t('msg.openFailed')}: ${message}`);
    }
}

export async function openPlanConstraints(extensionUri: vscode.Uri): Promise<void> {
    const uri = vscode.Uri.joinPath(extensionUri, 'resources', 'plan', CONSTRAINTS_FILENAME);
    try {
        const data = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder().decode(data);
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`${t('msg.openFailed')}: ${message}`);
    }
}

export async function openPlanReadme(extensionUri: vscode.Uri): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }
    const plansDir = path.join(workspace.uri.fsPath, PLANS_DIR);
    const readmePath = path.join(plansDir, README_FILENAME);
    try {
        await fs.mkdir(plansDir, { recursive: true });
        try {
            await fs.access(readmePath);
        } catch {
            const templateUri = vscode.Uri.joinPath(extensionUri, 'resources', 'plan', README_FILENAME);
            const data = await vscode.workspace.fs.readFile(templateUri);
            await fs.writeFile(readmePath, data);
        }
        const uri = vscode.Uri.file(readmePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`${t('msg.openFailed')}: ${message}`);
    }
}

export async function installPlanConstraintsToWorkspace(extensionUri: vscode.Uri): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        vscode.window.showWarningMessage(t('msg.noWorkspace'));
        return;
    }
    const workspacePath = workspace.uri.fsPath;
    const constraintsUri = vscode.Uri.joinPath(extensionUri, 'resources', 'plan', CONSTRAINTS_FILENAME);
    const ruleUri = vscode.Uri.joinPath(extensionUri, 'resources', 'plan', RULE_FILENAME);
    const readmeUri = vscode.Uri.joinPath(extensionUri, 'resources', 'plan', README_FILENAME);
    try {
        const [constraintsData, ruleData, readmeData] = await Promise.all([
            vscode.workspace.fs.readFile(constraintsUri),
            vscode.workspace.fs.readFile(ruleUri),
            vscode.workspace.fs.readFile(readmeUri)
        ]);
        const plansDir = path.join(workspacePath, PLANS_DIR);
        const rulesDir = path.join(workspacePath, RULES_DIR);
        await fs.mkdir(plansDir, { recursive: true });
        await fs.mkdir(rulesDir, { recursive: true });
        const targetConstraintsPath = path.join(plansDir, CONSTRAINTS_FILENAME);
        const targetRulePath = path.join(rulesDir, RULE_FILENAME);
        const targetReadmePath = path.join(plansDir, README_FILENAME);
        await fs.writeFile(targetConstraintsPath, constraintsData);
        await fs.writeFile(targetRulePath, ruleData);
        try {
            await fs.access(targetReadmePath);
        } catch {
            await fs.writeFile(targetReadmePath, readmeData);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`${t('msg.installFailed')}: ${message}`);
    }
}

export async function openCoraPlanPlan(planPath: string): Promise<void> {
    const uri = vscode.Uri.file(planPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
}

export async function deleteCoraPlanPlan(
    planPath: string,
    provider: CoraPlanProvider
): Promise<void> {
    const uri = vscode.Uri.file(planPath);
    const confirm = await vscode.window.showWarningMessage(
        t('coraPlan.confirmDelete'),
        { modal: true },
        t('cmd.delete')
    );
    if (confirm !== t('cmd.delete')) {
        return;
    }
    try {
        await vscode.workspace.fs.delete(uri);
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input as { uri?: vscode.Uri } | undefined;
                if (input?.uri?.fsPath === planPath) {
                    await vscode.window.tabGroups.close(tab);
                    break;
                }
            }
        }
        provider.refresh();
        vscode.window.showInformationMessage(t('coraPlan.deleted'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`${t('msg.deleteFailed')}: ${message}`);
    }
}
