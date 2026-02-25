import * as vscode from 'vscode';
import { ServiceContainer } from '../commands/registerCommands';

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
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => c.pageTreeProvider.refresh()),
        vscode.workspace.onDidDeleteFiles(() => c.pageTreeProvider.refresh()),
        vscode.workspace.onDidRenameFiles(() => c.pageTreeProvider.refresh())
    );

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
                if (vscode.window.activeTextEditor) {
                    c.outlineProvider.updateForEditor(vscode.window.activeTextEditor);
                }
            }
        })
    );
}
