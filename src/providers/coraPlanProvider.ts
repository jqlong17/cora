import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { t } from '../utils/i18n';
import { getPlanProductIntro } from '../utils/planProductIntro';

const CONSTRAINTS_FILE = '00-PLAN-CONSTRAINTS.md';

type CoraPlanNodeKind = 'planFile' | 'welcome';

export class CoraPlanItem extends vscode.TreeItem {
    /** For plan file nodes: absolute path. Used by context menu (copyPath, revealInFinder). */
    public readonly reportPath?: string;

    constructor(
        label: string,
        public readonly kind: CoraPlanNodeKind,
        collapsibleState: vscode.TreeItemCollapsibleState,
        options?: { reportPath?: string; command?: { command: string; title: string; arguments?: unknown[] } }
    ) {
        super(label, collapsibleState);
        this.contextValue = `coraPlan.${kind}`;
        this.reportPath = options?.reportPath;
        if (options?.command) {
            this.command = options.command;
        }
        this.iconPath = this.pickIcon(kind);
    }

    private pickIcon(kind: CoraPlanNodeKind): vscode.ThemeIcon | undefined {
        switch (kind) {
            case 'planFile':
                return new vscode.ThemeIcon('file');
            case 'welcome':
                return new vscode.ThemeIcon('lightbulb');
            default:
                return undefined;
        }
    }
}

export class CoraPlanProvider implements vscode.TreeDataProvider<CoraPlanItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CoraPlanItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private items: CoraPlanItem[] = [];
    private extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async refreshPlans(workspacePath?: string): Promise<void> {
        const resolvedWorkspace = workspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!resolvedWorkspace) {
            this.items = [];
            this.refresh();
            return;
        }

        const plansDir = path.join(resolvedWorkspace, '.cursor', 'plans');
        try {
            const entries = await fs.readdir(plansDir, { withFileTypes: true });
            const planPaths = entries
                .filter(entry => entry.isFile() && entry.name.endsWith('.plan.md') && entry.name !== CONSTRAINTS_FILE)
                .map(entry => path.join(plansDir, entry.name));

            const sortedPaths = planPaths.slice().sort((a, b) => {
                const nameA = path.basename(a);
                const nameB = path.basename(b);
                const numA = /^(\d{2})-.+\.plan\.md$/.exec(nameA)?.[1];
                const numB = /^(\d{2})-.+\.plan\.md$/.exec(nameB)?.[1];
                const orderA = numA !== undefined ? parseInt(numA, 10) : 9999;
                const orderB = numB !== undefined ? parseInt(numB, 10) : 9999;
                if (orderA !== orderB) return orderA - orderB;
                return nameA.localeCompare(nameB, undefined, { numeric: true });
            });

            const planItems = sortedPaths.map((planPath, index) => {
                const item = new CoraPlanItem(
                    path.basename(planPath),
                    'planFile',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        reportPath: planPath,
                        command: {
                            command: 'knowledgeBase.openCoraPlanPlan',
                            title: 'Open plan',
                            arguments: [planPath]
                        }
                    }
                );
                item.tooltip = planPath;
                return item;
            });

            this.items = planItems;
        } catch {
            this.items = [];
        }
        this.refresh();
    }

    getTreeItem(element: CoraPlanItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CoraPlanItem): vscode.ProviderResult<CoraPlanItem[]> {
        if (element) {
            return [];
        }
        if (this.items.length === 0) {
            return this.buildWelcomeItem();
        }
        return this.items;
    }

    private async buildWelcomeItem(): Promise<CoraPlanItem[]> {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const intro =
            (await getPlanProductIntro(this.extensionUri, workspacePath)) || t('coraPlan.welcomeIntro');
        const welcome = new CoraPlanItem(
            intro,
            'welcome',
            vscode.TreeItemCollapsibleState.None,
            {
                command: {
                    command: 'knowledgeBase.installPlanConstraintsToWorkspace',
                    title: t('coraPlan.welcomeButton'),
                    arguments: []
                }
            }
        );
        welcome.description = t('coraPlan.welcomeButton');
        return [welcome];
    }
}
