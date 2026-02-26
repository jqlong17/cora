import * as vscode from 'vscode';
import { PageTreeProvider } from './providers/pageTreeProvider';
import { OutlineProvider } from './providers/outlineProvider';
import { PreviewProvider } from './providers/previewProvider';
import { SearchProvider } from './providers/searchProvider';
import { FileService } from './services/fileService';
import { FavoritesService } from './services/favoritesService';
import { OutlineService } from './services/outlineService';
import { ConfigService } from './services/configService';
import { registerCommands, ServiceContainer } from './commands/registerCommands';
import { registerListeners, syncEditorAssociationsForPreviewOnClick } from './listeners/registerListeners';
import { CoraMarkdownEditorProvider, CORA_MARKDOWN_VIEW_TYPE } from './editors/coraMarkdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Cora 插件已激活');

    // ── 1. 初始化服务 ──
    const configService = new ConfigService();
    const fileService = new FileService(configService);
    const favoritesService = new FavoritesService(context.workspaceState);
    const outlineService = new OutlineService();

    // ── 2. 初始化数据提供器 ──
    const pageTreeProvider = new PageTreeProvider(fileService, configService, favoritesService);
    const outlineProvider = new OutlineProvider(outlineService, configService);
    const previewProvider = new PreviewProvider(
        context,
        (uri) => outlineProvider.updateForUri(uri),
        (uri, content) => {
            void outlineProvider.updateFromContent(uri, content).catch(err =>
                console.error('Cora outline updateFromContent failed', err)
            );
        }
    );
    const searchProvider = new SearchProvider(fileService, configService);

    // ── 3. 注册树视图 ──
    const pageTreeView = vscode.window.createTreeView('pageTree', {
        treeDataProvider: pageTreeProvider,
        showCollapseAll: false,
        canSelectMany: true
    });
    const outlineTreeView = vscode.window.createTreeView('kbOutline', {
        treeDataProvider: outlineProvider,
        showCollapseAll: false,
        canSelectMany: false
    });
    const searchTreeView = vscode.window.createTreeView('search', {
        treeDataProvider: searchProvider,
        showCollapseAll: false,
        canSelectMany: false
    });

    pageTreeProvider.setTreeView(pageTreeView);
    outlineProvider.setTreeView(outlineTreeView);

    context.subscriptions.push(pageTreeView, outlineTreeView, searchTreeView);

    // ── 4. 构建服务容器 & 注册命令 / 监听器 ──
    const container: ServiceContainer = {
        configService,
        fileService,
        favoritesService,
        pageTreeProvider,
        outlineProvider,
        previewProvider,
        searchProvider,
        pageTreeView,
        lastKnownUri: undefined
    };

    registerCommands(context, container);
    registerListeners(context, container);

    // ── 5. 注册 Markdown Custom Editor（供「从链接/资源管理器打开即用 Cora 预览」） ──
    const coraMarkdownProvider = new CoraMarkdownEditorProvider(context, previewProvider);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            CORA_MARKDOWN_VIEW_TYPE,
            coraMarkdownProvider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );
    syncEditorAssociationsForPreviewOnClick(configService);

    // ── 6. 初始化当前编辑器的大纲 ──
    if (vscode.window.activeTextEditor) {
        container.lastKnownUri = vscode.window.activeTextEditor.document.uri;
        outlineProvider.updateForEditor(vscode.window.activeTextEditor);
    }
}

export function deactivate() {
    console.log('Cora 插件已停用');
}
