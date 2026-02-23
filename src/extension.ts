import * as vscode from 'vscode';
import { PageTreeProvider } from './providers/pageTreeProvider';
import { OutlineProvider } from './providers/outlineProvider';
import { DatabaseProvider } from './providers/databaseProvider';
import { FileService } from './services/fileService';
import { OutlineService } from './services/outlineService';
import { ConfigService } from './services/configService';
import * as commands from './commands';

export function activate(context: vscode.ExtensionContext) {
    console.log('Cora 插件已激活');

    // 初始化服务
    const configService = new ConfigService();
    const fileService = new FileService(configService);
    const outlineService = new OutlineService();

    // 初始化数据提供器
    const pageTreeProvider = new PageTreeProvider(fileService, configService);
    const outlineProvider = new OutlineProvider(outlineService, configService);
    const databaseProvider = new DatabaseProvider();

    // 注册树视图
    const pageTreeView = vscode.window.createTreeView('pageTree', {
        treeDataProvider: pageTreeProvider,
        showCollapseAll: true,
        canSelectMany: false
    });

    const outlineTreeView = vscode.window.createTreeView('kbOutline', {
        treeDataProvider: outlineProvider,
        showCollapseAll: true,
        canSelectMany: false
    });

    const databaseTreeView = vscode.window.createTreeView('database', {
        treeDataProvider: databaseProvider,
        showCollapseAll: false,
        canSelectMany: false
    });

    // 存储视图引用到提供器中
    pageTreeProvider.setTreeView(pageTreeView);
    outlineProvider.setTreeView(outlineTreeView);

    // 注册命令
    context.subscriptions.push(
        // 页面树命令
        vscode.commands.registerCommand('knowledgeBase.refreshPageTree', () => {
            pageTreeProvider.refresh();
        }),
        vscode.commands.registerCommand('knowledgeBase.toggleFilter', () => {
            commands.toggleFilter(configService, pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.showAllFiles', () => {
            commands.setFilterMode('all', configService, pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.showMarkdownOnly', () => {
            commands.setFilterMode('markdown', configService, pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.collapseAll', () => {
            commands.collapseAll(pageTreeView);
        }),
        vscode.commands.registerCommand('knowledgeBase.expandAll', () => {
            commands.expandAll(pageTreeProvider, pageTreeView);
        }),

        // 文件操作命令
        vscode.commands.registerCommand('knowledgeBase.newNote', (item) => {
            commands.newNote(item, fileService, pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.newFolder', (item) => {
            commands.newFolder(item, fileService, pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.deleteItem', (item) => {
            commands.deleteItem(item, fileService, pageTreeProvider);
        }),
        vscode.commands.registerCommand('knowledgeBase.renameItem', (item) => {
            commands.renameItem(item, fileService, pageTreeProvider);
        }),

        // 编辑和预览命令
        vscode.commands.registerCommand('knowledgeBase.openPreview', (uri) => {
            commands.openPreview(uri);
        }),
        vscode.commands.registerCommand('knowledgeBase.openEditor', (uri) => {
            commands.openEditor(uri);
        }),
        vscode.commands.registerCommand('knowledgeBase.togglePreviewEditor', () => {
            commands.togglePreviewEditor();
        }),
        vscode.commands.registerCommand('knowledgeBase.openTextEditor', (uri) => {
            openTextEditor(uri);
        }),

        // 大纲命令
        vscode.commands.registerCommand('knowledgeBase.gotoHeading', (line) => {
            commands.gotoHeading(line);
        }),

        // 注册视图
        pageTreeView,
        outlineTreeView,
        databaseTreeView
    );

    // 监听编辑器变化，更新大纲
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                outlineProvider.updateForEditor(editor);
            } else {
                // Editor is undefined, might be preview mode - check active tab
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    const uri = getUriFromTab(activeTab);
                    if (uri) {
                        outlineProvider.updateForUri(uri);
                    } else {
                        outlineProvider.clear();
                    }
                } else {
                    outlineProvider.clear();
                }
            }
        }),
        // 监听标签页变化（支持预览模式）
        vscode.window.tabGroups.onDidChangeTabs((e) => {
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                const uri = getUriFromTab(activeTab);
                if (uri) {
                    // Check if it's a markdown file
                    outlineProvider.updateForUri(uri);
                }
            }
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                outlineProvider.updateForEditor(activeEditor);
            } else {
                // Check if it's the active preview
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    const uri = getUriFromTab(activeTab);
                    if (uri && event.document.uri.toString() === uri.toString()) {
                        outlineProvider.updateForUri(uri);
                    }
                }
            }
        }),
        vscode.workspace.onDidCreateFiles(() => {
            pageTreeProvider.refresh();
        }),
        vscode.workspace.onDidDeleteFiles(() => {
            pageTreeProvider.refresh();
        }),
        vscode.workspace.onDidRenameFiles(() => {
            pageTreeProvider.refresh();
        })
    );

    // 初始化当前编辑器的大纲
    if (vscode.window.activeTextEditor) {
        outlineProvider.updateForEditor(vscode.window.activeTextEditor);
    }

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('knowledgeBase')) {
                configService.reload();
                pageTreeProvider.refresh();
                if (vscode.window.activeTextEditor) {
                    outlineProvider.updateForEditor(vscode.window.activeTextEditor);
                }
            }
        })
    );
}

export function deactivate() {
    console.log('Cora 插件已停用');
}

// Helper function to extract URI from a tab
function getUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
    const input = tab.input as any;
    if (!input) {
        return undefined;
    }

    // Handle different tab input types
    if (input.uri) {
        return typeof input.uri === 'string' ? vscode.Uri.file(input.uri) : input.uri;
    }

    // For markdown preview and other custom editors
    if (input.viewType === 'markdown.preview' && input.resource) {
        return typeof input.resource === 'string' ? vscode.Uri.file(input.resource) : input.resource;
    }

    // Try common properties
    const possibleUri = input.resource || input.path || input.document;
    if (possibleUri) {
        return typeof possibleUri === 'string' ? vscode.Uri.file(possibleUri) : possibleUri;
    }

    return undefined;
}

// Helper function to open text editor directly (not preview)
async function openTextEditor(uri: vscode.Uri): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.One
        });
    } catch (error) {
        vscode.window.showErrorMessage(`无法打开文件: ${error}`);
    }
}
