import * as vscode from 'vscode';
import { PageTreeProvider, PageTreeItem } from '../providers/pageTreeProvider';
import { OutlineProvider } from '../providers/outlineProvider';
import { PreviewProvider } from '../providers/previewProvider';
import { SearchProvider } from '../providers/searchProvider';
import { FileService } from '../services/fileService';
import { ConfigService } from '../services/configService';
import * as commands from '../commands';

export interface ServiceContainer {
    configService: ConfigService;
    fileService: FileService;
    pageTreeProvider: PageTreeProvider;
    outlineProvider: OutlineProvider;
    previewProvider: PreviewProvider;
    searchProvider: SearchProvider;
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

        // ── 大纲 ──
        vscode.commands.registerCommand('knowledgeBase.gotoHeading', (line: number, documentUriStr?: string) => {
            commands.gotoHeading(line, documentUriStr, c.previewProvider, c.outlineProvider);
        }),

        // ── 右键菜单 ──
        vscode.commands.registerCommand('knowledgeBase.revealInFinder', (item) => {
            commands.revealInFinder(item);
        }),
        vscode.commands.registerCommand('knowledgeBase.copyPath', (item) => {
            commands.copyPath(item);
        }),
        vscode.commands.registerCommand('knowledgeBase.copyRelativePath', (item) => {
            commands.copyRelativePath(item);
        }),
        vscode.commands.registerCommand('knowledgeBase.copyFile', (item) => {
            commands.copyFile(item, c.fileService);
        }),

        // ── 搜索 ──
        vscode.commands.registerCommand('knowledgeBase.searchNotes', async () => {
            const query = await vscode.window.showInputBox({
                prompt: '输入搜索关键词',
                placeHolder: '支持单个关键词或多个关键词（空格分隔）',
                value: c.searchProvider.getLastQuery()
            });
            if (query) {
                await c.searchProvider.search(query);
            }
        }),
        vscode.commands.registerCommand('knowledgeBase.clearSearch', () => {
            c.searchProvider.clear();
            vscode.window.showInformationMessage('搜索结果已清空');
        })
    );
}
