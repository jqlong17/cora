import * as vscode from 'vscode';
import { PageTreeProvider, PageTreeItem } from '../providers/pageTreeProvider';
import { OutlineProvider } from '../providers/outlineProvider';
import { PreviewProvider } from '../providers/previewProvider';
import { SearchProvider } from '../providers/searchProvider';
import { CoraWikiProvider } from '../providers/coraWikiProvider';
import { FileService } from '../services/fileService';
import { ConfigService } from '../services/configService';
import { FavoritesService } from '../services/favoritesService';
import * as commands from '../commands';
import { t } from '../utils/i18n';

export interface ServiceContainer {
    configService: ConfigService;
    fileService: FileService;
    favoritesService: FavoritesService;
    pageTreeProvider: PageTreeProvider;
    outlineProvider: OutlineProvider;
    previewProvider: PreviewProvider;
    searchProvider: SearchProvider;
    coraWikiProvider: CoraWikiProvider;
    pageTreeView: vscode.TreeView<PageTreeItem>;
    lastKnownUri: vscode.Uri | undefined;
}

/**
 * 注册所有命令
 */
export function registerCommands(context: vscode.ExtensionContext, c: ServiceContainer): void {
    context.subscriptions.push(
        // ── 页面树 ──
        vscode.commands.registerCommand('knowledgeBase.refreshPageTree', () => {
            c.pageTreeProvider.refresh();
        }),
        vscode.commands.registerCommand('knowledgeBase.toggleFilter', () => {
            commands.toggleFilter(c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.togglePageView', () => {
            commands.togglePageView(c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setPageViewModeTree', () => {
            void commands.setPageViewMode('tree', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setPageViewModeFlat', () => {
            void commands.setPageViewMode('flat', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setPageViewModeFavorites', () => {
            void commands.setPageViewMode('favorites', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.toggleFavorite', (item: vscode.TreeItem | undefined) => {
            void commands.toggleFavorite(item, c.favoritesService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.setSortOrder', () => {
            commands.setSortOrder(c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.showAllFiles', () => {
            commands.setFilterMode('all', c.configService, c.pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.showMarkdownOnly', () => {
            commands.setFilterMode('markdown', c.configService, c.pageTreeProvider);
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
            commands.deleteItem(item, c.fileService, c.pageTreeProvider);
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
            commands.copyPath(item, c.pageTreeView);
        }),
        vscode.commands.registerCommand('knowledgeBase.copyRelativePath', (item) => {
            commands.copyRelativePath(item, c.pageTreeView);
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
            vscode.window.showInformationMessage(t('search.cleared'));
        }),
        vscode.commands.registerCommand('knowledgeBase.startCoraWikiResearch', () => {
            void commands.startCoraWikiResearch(c.coraWikiProvider);
        })
    );
}
