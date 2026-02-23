import * as vscode from 'vscode';
import { PageTreeProvider } from './providers/pageTreeProvider';
import { OutlineProvider } from './providers/outlineProvider';
import { SearchProvider } from './providers/searchProvider';
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
    const searchProvider = new SearchProvider(fileService, configService);

    // 跟踪最后已知的文档 URI（用于预览模式）
    let lastKnownUri: vscode.Uri | undefined = undefined;

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

    const searchTreeView = vscode.window.createTreeView('search', {
        treeDataProvider: searchProvider,
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
        vscode.commands.registerCommand('knowledgeBase.togglePageView', () => {
            commands.togglePageView(configService, pageTreeProvider);
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
        // 大纲命令
        vscode.commands.registerCommand('knowledgeBase.gotoHeading', (line) => {
            commands.gotoHeading(line);
        }),

        // 右键菜单命令
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
            commands.copyFile(item, fileService);
        }),

        // 搜索命令
        vscode.commands.registerCommand('knowledgeBase.searchNotes', async () => {
            const query = await vscode.window.showInputBox({
                prompt: '输入搜索关键词',
                placeHolder: '支持单个关键词或多个关键词（空格分隔）',
                value: searchProvider.getLastQuery()
            });
            if (query) {
                await searchProvider.search(query);
            }
        }),
        vscode.commands.registerCommand('knowledgeBase.clearSearch', () => {
            searchProvider.clear();
            vscode.window.showInformationMessage('搜索结果已清空');
        }),

        // 注册视图
        pageTreeView,
        outlineTreeView,
        searchTreeView
    );

    // 监听编辑器变化，更新大纲
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            console.log('Active text editor changed:', editor ? editor.document.fileName : 'undefined');
            if (editor) {
                // Track the last known URI from the editor
                lastKnownUri = editor.document.uri;
                outlineProvider.updateForEditor(editor);
            } else {
                // Editor is undefined, might be preview mode
                // Try to get URI from tab, fallback to lastKnownUri
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    let uri = getUriFromTab(activeTab);
                    if (!uri && lastKnownUri) {
                        console.log('Using last known URI:', lastKnownUri.toString());
                        uri = lastKnownUri;
                    }
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
            console.log('Tabs changed, open tabs:', e.opened.length, 'closed tabs:', e.closed.length);
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                let uri = getUriFromTab(activeTab);
                // If tab has no input but we have lastKnownUri, use it
                if (!uri && lastKnownUri) {
                    console.log('Tab has no input, using last known URI:', lastKnownUri.toString());
                    uri = lastKnownUri;
                }
                if (uri) {
                    console.log('Active tab URI:', uri.toString());
                    outlineProvider.updateForUri(uri);
                }
            }
        }),
        // 监听活动标签组变化
        vscode.window.onDidChangeActiveColorTheme(() => {
            // Theme change might indicate view change, refresh outline
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                const uri = getUriFromTab(activeTab);
                if (uri) {
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

    // 监听窗口焦点变化，用于更新预览模式下的大纲
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState((e) => {
            if (e.focused) {
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    let uri = getUriFromTab(activeTab);
                    if (!uri && lastKnownUri) {
                        uri = lastKnownUri;
                    }
                    if (uri) {
                        outlineProvider.updateForUri(uri);
                    }
                }
            }
        })
    );

    // 初始化当前编辑器的大纲
    if (vscode.window.activeTextEditor) {
        lastKnownUri = vscode.window.activeTextEditor.document.uri;
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
    console.log('Tab input:', JSON.stringify(input, null, 2));

    if (!input) {
        console.log('No tab input found');
        return undefined;
    }

    // Handle different tab input types
    if (input.uri) {
        console.log('Found URI in input.uri:', input.uri);
        return typeof input.uri === 'string' ? vscode.Uri.file(input.uri) : input.uri;
    }

    // For markdown preview and other custom editors
    // Try multiple possible view types for markdown preview
    const previewViewTypes = ['markdown.preview', 'vscode.markdown.preview', 'default.markdown.preview'];
    if (previewViewTypes.includes(input.viewType)) {
        if (input.resource) {
            console.log('Found preview resource:', input.resource);
            return typeof input.resource === 'string' ? vscode.Uri.file(input.resource) : input.resource;
        }
    }

    // Try common properties
    const possibleUri = input.resource || input.path || input.document || input.fileName || input.fsPath;
    if (possibleUri) {
        console.log('Found URI in common property:', possibleUri);
        return typeof possibleUri === 'string' ? vscode.Uri.file(possibleUri) : possibleUri;
    }

    // For webview-based previews, try to extract from webview options
    if (input.webviewOptions?.path) {
        console.log('Found URI in webviewOptions:', input.webviewOptions.path);
        return vscode.Uri.file(input.webviewOptions.path);
    }

    console.log('Could not extract URI from tab input');
    return undefined;
}

