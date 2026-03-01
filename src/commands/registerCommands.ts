import * as vscode from 'vscode';
import { PageTreeProvider, PageTreeItem } from '../providers/pageTreeProvider';
import { OutlineProvider } from '../providers/outlineProvider';
import { PreviewProvider } from '../providers/previewProvider';
import { SearchProvider } from '../providers/searchProvider';
import { CoraWikiProvider, CoraWikiItem } from '../providers/coraWikiProvider';
import { CoraPlanProvider, CoraPlanItem } from '../providers/coraPlanProvider';
import { FileService } from '../services/fileService';
import { ConfigService } from '../services/configService';
import { FavoritesService } from '../services/favoritesService';
import * as commands from '../commands';
import { t } from '../utils/i18n';
import { syncPageTreeViewLayoutContext } from '../utils/pageTreeContext';

export interface ServiceContainer {
    configService: ConfigService;
    fileService: FileService;
    favoritesService: FavoritesService;
    pageTreeProvider: PageTreeProvider;
    outlineProvider: OutlineProvider;
    previewProvider: PreviewProvider;
    searchProvider: SearchProvider;
    coraWikiProvider: CoraWikiProvider;
    coraPlanProvider: CoraPlanProvider;
    pageTreeView: vscode.TreeView<PageTreeItem>;
    coraWikiTreeView: vscode.TreeView<CoraWikiItem>;
    coraPlanTreeView: vscode.TreeView<CoraPlanItem>;
    lastKnownUri: vscode.Uri | undefined;
}

/**
 * 注册所有命令
 */
export function registerCommands(context: vscode.ExtensionContext, c: ServiceContainer): void {
    context.subscriptions.push(
        // ── 页面树（右侧 icon：全部/仅MD/收藏/树状/平铺/排序/刷新/新建文件/新建文件夹） ──
        vscode.commands.registerCommand('knowledgeBase.refreshPageTree', () => {
            c.pageTreeProvider.refresh();
        }),
        vscode.commands.registerCommand('knowledgeBase.toggleFilter', () => {
            commands.toggleFilter(c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.togglePageView', async () => {
            await commands.togglePageView(c.configService, c.pageTreeProvider);
            syncPageTreeViewLayoutContext(c.configService);
        }),
        vscode.commands.registerCommand('knowledgeBase.togglePageViewTree', () => {
            return vscode.commands.executeCommand('knowledgeBase.togglePageView');
        }),
        vscode.commands.registerCommand('knowledgeBase.togglePageViewFlat', () => {
            return vscode.commands.executeCommand('knowledgeBase.togglePageView');
        }),
        vscode.commands.registerCommand('knowledgeBase.setPageViewModeTree', () => {
            void commands.setPageViewMode('tree', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setPageViewModeFlat', () => {
            void commands.setPageViewMode('flat', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setPageViewModeFavorites', async () => {
            await commands.setPageViewMode('favorites', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.toggleFavorite', (item: vscode.TreeItem | undefined) => {
            void commands.toggleFavorite(item, c.favoritesService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setSortOrder', () => {
            commands.setSortOrder(c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.showAllFiles', async () => {
            await commands.setFilterMode('all', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.showMarkdownOnly', async () => {
            await commands.setFilterMode('markdown', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.outlineCollapseAll', () => {
            commands.outlineCollapseAll();
        }),
        vscode.commands.registerCommand('knowledgeBase.outlineExpandAll', () => {
            commands.outlineExpandAll(c.outlineProvider);
        }),

        // ── 文件操作 ──
        vscode.commands.registerCommand('knowledgeBase.newNote', (item) => {
            commands.newNote(item, c.fileService, c.pageTreeProvider, c.previewProvider, c.pageTreeView);
        }),
        vscode.commands.registerCommand('knowledgeBase.newFolder', (item) => {
            commands.newFolder(item, c.fileService, c.pageTreeProvider, c.pageTreeView);
        }),
        vscode.commands.registerCommand('knowledgeBase.deleteItem', (item) => {
            void commands.deleteItem(item, c.fileService, c.pageTreeProvider, c.pageTreeView);
        }),
        vscode.commands.registerCommand('knowledgeBase.renameItem', (item) => {
            commands.renameItem(item, c.fileService, c.pageTreeProvider);
        }),

        // ── 编辑与预览 ──
        vscode.commands.registerCommand('knowledgeBase.openPreview', async (uri: vscode.Uri | undefined) => {
            await commands.openPreview(c.previewProvider, uri);
            const effectiveUri = uri ?? c.previewProvider.getCurrentUri();
            if (effectiveUri) {
                c.lastKnownUri = effectiveUri;
                c.outlineProvider.updateForUri(effectiveUri);
            }
        }),
        vscode.commands.registerCommand('knowledgeBase.openEditor', async (uri: vscode.Uri | undefined) => {
            await commands.openEditor(uri, c.previewProvider);
            const effectiveUri = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (effectiveUri) {
                c.lastKnownUri = effectiveUri;
            }
        }),
        vscode.commands.registerCommand('knowledgeBase.togglePreviewEditor', () => {
            commands.togglePreviewEditor(c.previewProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.selectFont', async () => {
            await commands.selectFont(c.previewProvider);
        }),

        // ── 大纲 ──
        vscode.commands.registerCommand('knowledgeBase.gotoHeading', (line: number, documentUriStr?: string) => {
            commands.gotoHeading(line, documentUriStr, c.previewProvider, c.outlineProvider);
        }),

        // ── 右键菜单 ──
        vscode.commands.registerCommand('knowledgeBase.revealInFinder', (item) => {
            commands.revealInFinder(item);
        }),
        vscode.commands.registerCommand('knowledgeBase.copyPath', (item) => {
            const view = item && typeof item === 'object' && 'contextValue' in item && String((item as { contextValue?: string }).contextValue).startsWith('coraPlan.')
                ? undefined
                : c.pageTreeView;
            commands.copyPath(item, view);
        }),
        vscode.commands.registerCommand('knowledgeBase.copyRelativePath', (item) => {
            const view = item && typeof item === 'object' && 'contextValue' in item && String((item as { contextValue?: string }).contextValue).startsWith('coraPlan.')
                ? undefined
                : c.pageTreeView;
            commands.copyRelativePath(item, view);
        }),

        // ── 搜索 ──
        vscode.commands.registerCommand('knowledgeBase.searchNotes', async () => {
            const query = await vscode.window.showInputBox({
                prompt: t('search.prompt'),
                placeHolder: t('search.placeHolder'),
                value: c.searchProvider.getLastQuery()
            });
            if (query) {
                await c.searchProvider.search(query);
            }
        }),
        vscode.commands.registerCommand('knowledgeBase.clearSearch', () => {
            c.searchProvider.clear();
        }),
        vscode.commands.registerCommand('knowledgeBase.startCoraWikiResearch', () => {
            void commands.startCoraWikiResearch(c.coraWikiProvider, c.configService, undefined, context.extensionPath);
        }),
        vscode.commands.registerCommand('knowledgeBase.startCoraWikiWorkspaceArchitectureResearch', () => {
            void commands.startCoraWikiWorkspaceArchitectureResearch(c.coraWikiProvider, c.configService, context.extensionPath);
        }),
        vscode.commands.registerCommand('knowledgeBase.openLatestCoraWikiReport', () => {
            void commands.openLatestCoraWikiReport(c.coraWikiProvider, c.previewProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.openCoraWikiReport', (reportPath: string) => {
            void commands.openCoraWikiReport(reportPath, c.previewProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.deleteCoraWikiReport', (item) => {
            void commands.deleteCoraWikiReport(item, c.coraWikiProvider, c.coraWikiTreeView);
        }),
        vscode.commands.registerCommand('knowledgeBase.openCoraWikiReference', (reference: string) => {
            void commands.openCoraWikiReference(reference);
        }),
        vscode.commands.registerCommand('knowledgeBase.openCoraWikiUsage', () => {
            void commands.openCoraWikiUsage(context.extensionUri);
        }),

        // ── CoraPlan ──
        vscode.commands.registerCommand('knowledgeBase.openPlanConstraints', () => {
            void commands.openPlanConstraints(context.extensionUri);
        }),
        vscode.commands.registerCommand('knowledgeBase.openPlanReadme', () => {
            void commands.openPlanReadme(context.extensionUri);
        }),
        vscode.commands.registerCommand('knowledgeBase.installPlanConstraintsToWorkspace', () => {
            void commands.installPlanConstraintsToWorkspace(context.extensionUri);
        }),
        vscode.commands.registerCommand('knowledgeBase.openCoraPlanUsage', () => {
            void commands.openCoraPlanUsage(context.extensionUri);
        }),
        vscode.commands.registerCommand('knowledgeBase.openCoraPlanPlan', (planPath: string) => {
            void commands.openCoraPlanPlan(planPath);
        }),
        vscode.commands.registerCommand('knowledgeBase.deleteCoraPlanPlan', (item: { reportPath?: string } | string) => {
            const planPath = typeof item === 'string' ? item : item?.reportPath;
            if (planPath) {
                void commands.deleteCoraPlanPlan(planPath, c.coraPlanProvider);
            }
        })
    );
    syncPageTreeViewLayoutContext(c.configService);
}
