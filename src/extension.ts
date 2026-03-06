import * as vscode from 'vscode';
import { PageTreeProvider } from './providers/pageTreeProvider';
import { OutlineProvider } from './providers/outlineProvider';
import { PreviewProvider } from './providers/previewProvider';
import { SearchProvider } from './providers/searchProvider';
import { CoraWikiProvider } from './providers/coraWikiProvider';
import { CoraPlanProvider } from './providers/coraPlanProvider';
import { FileService } from './services/fileService';
import { FavoritesService } from './services/favoritesService';
import { OutlineService } from './services/outlineService';
import { ConfigService } from './services/configService';
import { registerCommands, ServiceContainer } from './commands/registerCommands';
import { registerListeners, syncEditorAssociationsForPreviewOnClick } from './listeners/registerListeners';
import { syncPageTreeViewLayoutContext } from './utils/pageTreeContext';
import { CoraMarkdownEditorProvider, CORA_MARKDOWN_VIEW_TYPE } from './editors/coraMarkdownEditorProvider';
import { t } from './utils/i18n';

/** 页面树视图标题：有工作区时显示当前项目目录名（与 VS Code 资源管理器一致），否则显示「页面」/ Pages */
function getPageTreeViewTitle(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? folder.name : t('view.pages');
}

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
    const searchProvider = new SearchProvider(configService);
    const coraWikiProvider = new CoraWikiProvider();
    const coraPlanProvider = new CoraPlanProvider(context.extensionUri);

    // ── 3. 注册树视图 ──
    const pageTreeView = vscode.window.createTreeView('pageTree', {
        treeDataProvider: pageTreeProvider,
        dragAndDropController: pageTreeProvider.getDragAndDropController(),
        showCollapseAll: false,
        canSelectMany: true
    });
    pageTreeView.title = getPageTreeViewTitle();
    pageTreeProvider.setTreeView(pageTreeView);
    const outlineTreeView = vscode.window.createTreeView('kbOutline', {
        treeDataProvider: outlineProvider,
        showCollapseAll: false,
        canSelectMany: false
    });
    const coraWikiTreeView = vscode.window.createTreeView('coraWiki', {
        treeDataProvider: coraWikiProvider,
        showCollapseAll: false,
        canSelectMany: true
    });
    void coraWikiProvider.refreshReports(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    const coraPlanTreeView = vscode.window.createTreeView('coraPlan', {
        treeDataProvider: coraPlanProvider,
        showCollapseAll: false,
        canSelectMany: true
    });
    void coraPlanProvider.refreshPlans(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);

    outlineProvider.setTreeView(outlineTreeView);

    context.subscriptions.push(pageTreeView, outlineTreeView, coraWikiTreeView, coraPlanTreeView);

    // ── 4. 注册 Markdown Custom Editor ──
    const coraMarkdownEditorProvider = new CoraMarkdownEditorProvider(context, previewProvider);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            CORA_MARKDOWN_VIEW_TYPE,
            coraMarkdownEditorProvider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );
    // 清理历史遗留的 editorAssociations（不再用全局关联劫持 .md 打开方式）
    syncEditorAssociationsForPreviewOnClick(configService);

    // ── 5. 构建服务容器 & 注册命令 / 监听器 ──
    const container: ServiceContainer = {
        configService,
        fileService,
        favoritesService,
        pageTreeProvider,
        outlineProvider,
        previewProvider,
        searchProvider,
        coraWikiProvider,
        coraPlanProvider,
        coraMarkdownEditorProvider,
        pageTreeView,
        coraWikiTreeView,
        coraPlanTreeView,
        lastKnownUri: undefined
    };

    registerCommands(context, container);
    registerListeners(context, container);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('knowledgeBase.pageViewMode')) {
                syncPageTreeViewLayoutContext(configService);
            }
        })
    );

    // 工作区变化时：更新页面树标题（显示当前项目目录名）、刷新 CoraPlan
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            pageTreeView.title = getPageTreeViewTitle();
            void coraPlanProvider.refreshPlans(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
        })
    );
    const plansWatcher = vscode.workspace.createFileSystemWatcher('**/.cursor/plans/*.plan.md');
    plansWatcher.onDidChange(() => void coraPlanProvider.refreshPlans(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath));
    plansWatcher.onDidCreate(() => void coraPlanProvider.refreshPlans(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath));
    plansWatcher.onDidDelete(() => void coraPlanProvider.refreshPlans(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath));
    context.subscriptions.push(plansWatcher);

    // 切换 CoraWiki 提供商时自动应用该提供商的 baseUrl / model / apiKeyEnvName 预设
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('knowledgeBase.coraWiki.provider')) {
                void configService.applyCoraWikiProviderPreset();
            }
        })
    );

    // ── 6. 初始化当前编辑器的大纲 ──
    if (vscode.window.activeTextEditor) {
        container.lastKnownUri = vscode.window.activeTextEditor.document.uri;
        outlineProvider.updateForEditor(vscode.window.activeTextEditor);
    }
}

export function deactivate() {
    console.log('Cora 插件已停用');
}
