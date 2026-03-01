import * as vscode from 'vscode';
import { ServiceContainer } from '../commands/registerCommands';
import type { ConfigService } from '../services/configService';
import { isMarkdownFile } from '../utils/markdownParser';
import { CORA_MARKDOWN_VIEW_TYPE } from '../editors/coraMarkdownEditorProvider';

/** 根据「点击用预览打开」同步 workbench.editorAssociations（供 extension 激活时与配置变更时调用） */
export function syncEditorAssociationsForPreviewOnClick(configService: ConfigService): void {
    const useCora = configService.getPreviewOnClick();
    const cfg = vscode.workspace.getConfiguration('workbench');
    const current = cfg.get<Record<string, string>>('editorAssociations') ?? {};
    const patterns = ['*.md', '*.markdown', '*.mdx', '*.mdc'];
    const next = { ...current };
    if (useCora) {
        for (const p of patterns) next[p] = CORA_MARKDOWN_VIEW_TYPE;
    } else {
        for (const p of patterns) delete next[p];
    }
    void cfg.update('editorAssociations', next, vscode.ConfigurationTarget.Global);
}

/**
 * 从 Tab 中提取文件 URI（支持普通编辑器和自定义编辑器）
 */
function getUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
    const input = tab.input;
    if (!input) return undefined;

    if (typeof input === 'object') {
        // TabInputText
        if ('uri' in input && input.uri instanceof vscode.Uri) {
            return input.uri;
        }
        // TabInputCustom
        if ('uri' in input && input.uri instanceof vscode.Uri) {
            return input.uri;
        }
        // TabInputNotebook
        if ('uri' in input && input.uri instanceof vscode.Uri) {
            return input.uri;
        }
        // TabInputWebview — 无 URI
    }
    return undefined;
}

/**
 * 注册所有事件监听器
 */
export function registerListeners(context: vscode.ExtensionContext, c: ServiceContainer): void {
    // ── 编辑器变化 → 更新大纲 ──
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                c.lastKnownUri = editor.document.uri;
                c.outlineProvider.updateForEditor(editor);
            } else {
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    const uri = getUriFromTab(activeTab);
                    if (uri) {
                        c.outlineProvider.updateForUri(uri);
                    } else if (!c.lastKnownUri) {
                        c.outlineProvider.clear();
                    }
                    // lastKnownUri 存在时不用磁盘覆盖大纲（避免冲掉编辑模式中未保存的内容）
                } else {
                    c.outlineProvider.clear();
                }
            }
        })
    );

    // ── 标签页变化（支持预览模式） ──
    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(() => {
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                let uri = getUriFromTab(activeTab);
                if (!uri && c.lastKnownUri) {
                    uri = c.lastKnownUri;
                }
                if (uri) {
                    c.outlineProvider.updateForUri(uri);
                }
            }
        })
    );

    // ── 文档内容变化 ──
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                c.outlineProvider.updateForEditor(activeEditor);
            } else {
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    const uri = getUriFromTab(activeTab);
                    if (uri && event.document.uri.toString() === uri.toString()) {
                        c.outlineProvider.updateForUri(uri);
                    }
                }
            }
        })
    );

    // ── 文件系统变化 → 刷新页面树 ──
    // workspace 事件覆盖 VS Code 内部操作（资源管理器、WorkspaceEdit 等）
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => c.pageTreeProvider.refresh()),
        vscode.workspace.onDidDeleteFiles(() => c.pageTreeProvider.refresh()),
        vscode.workspace.onDidRenameFiles(() => c.pageTreeProvider.refresh())
    );

    // FileSystemWatcher 覆盖外部来源的文件变化（终端、git、外部程序等）
    let pageTreeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedPageTreeRefresh = (): void => {
        if (pageTreeRefreshTimer) clearTimeout(pageTreeRefreshTimer);
        pageTreeRefreshTimer = setTimeout(() => {
            pageTreeRefreshTimer = undefined;
            c.pageTreeProvider.refresh();
        }, 300);
    };
    const pageTreeWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    pageTreeWatcher.onDidCreate(debouncedPageTreeRefresh);
    pageTreeWatcher.onDidDelete(debouncedPageTreeRefresh);
    context.subscriptions.push(pageTreeWatcher);

    // ── 窗口焦点恢复 ──
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState((e) => {
            if (e.focused) {
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab) {
                    let uri = getUriFromTab(activeTab);
                    if (!uri && c.lastKnownUri) {
                        uri = c.lastKnownUri;
                    }
                    if (uri) {
                        c.outlineProvider.updateForUri(uri);
                    }
                }
            }
        })
    );

    // ── 配置变化 ──
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('knowledgeBase')) {
                c.configService.reload();
                c.pageTreeProvider.refresh();
                if (e.affectsConfiguration('knowledgeBase.previewOnClick')) {
                    syncEditorAssociationsForPreviewOnClick(c.configService);
                }
                if (vscode.window.activeTextEditor) {
                    c.outlineProvider.updateForEditor(vscode.window.activeTextEditor);
                }
            }
        })
    );

    // ── 从对话/链接等处以文本形式打开 .md 时，若开启「点击用预览打开」，则用 Cora 预览打开并关闭文本标签 ──
    const pendingReplaceUris = new Map<string, { uri: vscode.Uri; clearAt: number }>();
    const TTL_MS = 4000;
    const clearStale = (): void => {
        const now = Date.now();
        for (const [key, val] of pendingReplaceUris.entries()) {
            if (val.clearAt < now) pendingReplaceUris.delete(key);
        }
    };
    const closeTextTabForUri = (uriKey: string): boolean => {
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const ti = tab.input as { uri?: vscode.Uri; viewType?: string };
                if (ti?.uri?.toString() === uriKey && ti.viewType !== 'coraPreview' && ti.viewType !== CORA_MARKDOWN_VIEW_TYPE) {
                    void vscode.window.tabGroups.close(tab);
                    return true;
                }
            }
        }
        return false;
    };
    const tryReplaceWithPreview = (uriKey: string, uri: vscode.Uri): void => {
        void vscode.commands.executeCommand('knowledgeBase.openPreview', uri).then(() => {
            if (!closeTextTabForUri(uriKey)) {
                setTimeout(() => closeTextTabForUri(uriKey), 400);
            }
        });
    };

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (document.uri.scheme !== 'file') return;
            const exts = c.configService.getMarkdownExtensions();
            if (!isMarkdownFile(document.uri.fsPath, exts)) return;
            if (!c.configService.getPreviewOnClick()) return;

            const uri = document.uri;
            const uriKey = uri.toString();
            if (pendingReplaceUris.has(uriKey)) return;
            const clearAt = Date.now() + TTL_MS;
            pendingReplaceUris.set(uriKey, { uri, clearAt });
            setTimeout(clearStale, TTL_MS + 100);

            setTimeout(() => {
                if (!pendingReplaceUris.has(uriKey)) return;
                pendingReplaceUris.delete(uriKey);
                tryReplaceWithPreview(uriKey, uri);
            }, 400);
        })
    );

    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs((e) => {
            if (!e.opened.length || !c.configService.getPreviewOnClick()) return;
            clearStale();
            for (const tab of e.opened) {
                const ti = tab.input as { uri?: vscode.Uri; viewType?: string };
                const uriKey = ti?.uri?.toString();
                if (!uriKey || ti.viewType === 'coraPreview') continue;
                const pending = pendingReplaceUris.get(uriKey);
                if (!pending) continue;
                const exts = c.configService.getMarkdownExtensions();
                if (!isMarkdownFile(pending.uri.fsPath, exts)) continue;
                pendingReplaceUris.delete(uriKey);
                tryReplaceWithPreview(uriKey, pending.uri);
                return;
            }
        })
    );
}
