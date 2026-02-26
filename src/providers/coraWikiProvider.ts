import * as vscode from 'vscode';
import type { ResearchResult } from '../corawiki/types';
import { t } from '../utils/i18n';

type CoraWikiNodeKind = 'summary' | 'step' | 'reference';

export class CoraWikiItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly kind: CoraWikiNodeKind,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly children: CoraWikiItem[] = []
    ) {
        super(label, collapsibleState);
        this.contextValue = `coraWiki.${kind}`;
        this.iconPath = this.pickIcon(kind);
    }

    private pickIcon(kind: CoraWikiNodeKind): vscode.ThemeIcon {
        switch (kind) {
            case 'summary':
                return new vscode.ThemeIcon('sparkle');
            case 'step':
                return new vscode.ThemeIcon('tools');
            case 'reference':
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

export class CoraWikiProvider implements vscode.TreeDataProvider<CoraWikiItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CoraWikiItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private items: CoraWikiItem[] = [
        new CoraWikiItem(t('coraWiki.emptyHint'), 'summary', vscode.TreeItemCollapsibleState.None)
    ];

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setResult(result: ResearchResult): void {
        const stepItems = result.steps.map(step =>
            new CoraWikiItem(
                `[${step.stage}] ${step.action}`,
                'step',
                vscode.TreeItemCollapsibleState.None
            )
        );
        const refItems = result.references.map(ref =>
            new CoraWikiItem(ref, 'reference', vscode.TreeItemCollapsibleState.None)
        );

        this.items = [
            new CoraWikiItem(result.finalConclusion, 'summary', vscode.TreeItemCollapsibleState.Expanded, stepItems),
            new CoraWikiItem(t('coraWiki.referencesTitle'), 'reference', vscode.TreeItemCollapsibleState.Expanded, refItems)
        ];
        this.refresh();
    }

    getTreeItem(element: CoraWikiItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CoraWikiItem): vscode.ProviderResult<CoraWikiItem[]> {
        if (!element) {
            return this.items;
        }
        return element.children;
    }
}

