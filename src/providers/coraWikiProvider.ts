import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ResearchResult } from '../corawiki/types';
import { t } from '../utils/i18n';

type CoraWikiNodeKind = 'report' | 'welcome';

export class CoraWikiItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly kind: CoraWikiNodeKind,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly children: CoraWikiItem[] = [],
        public readonly reportPath?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = `coraWiki.${kind}`;
        this.iconPath = this.pickIcon(kind);
    }

    private pickIcon(kind: CoraWikiNodeKind): vscode.ThemeIcon {
        switch (kind) {
            case 'report':
                return new vscode.ThemeIcon('file');
            case 'welcome':
                return new vscode.ThemeIcon('lightbulb');
        }
    }
}

export class CoraWikiProvider implements vscode.TreeDataProvider<CoraWikiItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CoraWikiItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private items: CoraWikiItem[] = [];
    private latestResult: ResearchResult | undefined;
    private latestReportPath: string | undefined;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setResult(result: ResearchResult): void {
        this.latestResult = result;
    }

    setLatestReportPath(reportPath: string | undefined): void {
        this.latestReportPath = reportPath;
    }

    getLatestReportPath(): string | undefined {
        return this.latestReportPath;
    }

    getLatestResult(): ResearchResult | undefined {
        return this.latestResult;
    }

    setReports(reportPaths: string[]): void {
        this.items = reportPaths.map((reportPath, index) => {
            const item = new CoraWikiItem(
                this.formatReportTitle(path.basename(reportPath)),
                'report',
                vscode.TreeItemCollapsibleState.None,
                [],
                reportPath
            );
            item.tooltip = reportPath;
            item.description = index === 0 ? t('coraWiki.latestReportTag') : undefined;
            item.command = {
                command: 'knowledgeBase.openCoraWikiReport',
                title: 'Open CoraWiki Report',
                arguments: [reportPath]
            };
            return item;
        });
        if (reportPaths.length > 0) {
            this.latestReportPath = reportPaths[0];
        }
        this.refresh();
    }

    async refreshReports(workspacePath?: string): Promise<void> {
        const resolvedWorkspace = workspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!resolvedWorkspace) {
            this.items = [];
            this.refresh();
            return;
        }
        const reportDir = path.join(resolvedWorkspace, '.cora', 'reports');
        try {
            const entries = await fs.readdir(reportDir, { withFileTypes: true });
            const reportPaths = entries
                .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
                .map(entry => path.join(reportDir, entry.name))
                .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
            this.setReports(reportPaths);
        } catch {
            this.items = [];
            this.refresh();
        }
    }

    private formatReportTitle(fileName: string): string {
        const match = /^corawiki-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.md$/i.exec(fileName);
        if (!match) {
            return fileName;
        }
        const [, y, m, d, hh, mm] = match;
        return `${y}-${m}-${d} ${hh}:${mm} 架构报告`;
    }

    getTreeItem(element: CoraWikiItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CoraWikiItem): vscode.ProviderResult<CoraWikiItem[]> {
        if (element) {
            return element.children;
        }
        if (this.items.length === 0) {
            const welcome = new CoraWikiItem(
                t('coraWiki.welcomeIntro'),
                'welcome',
                vscode.TreeItemCollapsibleState.None
            );
            welcome.description = t('coraWiki.welcomeButton');
            welcome.command = {
                command: 'knowledgeBase.startCoraWikiWorkspaceArchitectureResearch',
                title: t('coraWiki.welcomeButton'),
                arguments: []
            };
            return [welcome];
        }
        return this.items;
    }
}

