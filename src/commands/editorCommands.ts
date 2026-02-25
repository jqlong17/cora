import * as vscode from 'vscode';
import type { PreviewProvider } from '../providers/previewProvider';

/** 使用 Cora 自带预览（含 Mermaid）打开文件 */
export async function openPreview(
    previewProvider: PreviewProvider,
    uri?: vscode.Uri
): Promise<void> {
    if (!uri) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            uri = activeEditor.document.uri;
        } else {
            vscode.window.showWarningMessage('请先选择一个文件');
            return;
        }
    }
    await previewProvider.openPreview(uri);
}

export async function openEditor(
    uri?: vscode.Uri,
    previewProvider?: PreviewProvider
): Promise<void> {
    if (!uri) {
        // Try to get from active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            uri = activeEditor.document.uri;
        } else {
            // Try to get preview's document from active tab
            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (activeTab) {
                uri = getUriFromTab(activeTab);
            }

            // Fallback to PreviewProvider's state if tab extraction fails
            if ((!uri || uri.scheme === 'webview-panel') && previewProvider) {
                uri = previewProvider.getCurrentUri();
            }

            if (!uri || uri.scheme === 'webview-panel') {
                vscode.window.showWarningMessage('请先选择一个文件');
                return;
            }
        }
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.One
    });
}

export async function togglePreviewEditor(
    previewProvider: PreviewProvider
): Promise<void> {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!activeTab) {
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        await openPreview(previewProvider, activeEditor.document.uri);
    } else {
        let uri = getUriFromTab(activeTab);
        if (!uri && previewProvider.hasOpenPanel()) {
            uri = previewProvider.getCurrentUri();
        }
        if (uri) {
            await openEditor(uri);
        } else {
            vscode.window.showWarningMessage('无法识别当前文件');
        }
    }
}

interface DisplaySettingItem extends vscode.QuickPickItem {
    key: string;
    value: string | number;
}

async function refreshPreviewIfOpen(previewProvider?: PreviewProvider): Promise<void> {
    if (previewProvider?.hasOpenPanel()) {
        await previewProvider.updatePreview();
    }
}

export async function selectFont(previewProvider?: PreviewProvider): Promise<void> {
    const config = vscode.workspace.getConfiguration('knowledgeBase');
    const currentFont = config.get<string>('fontFamily');
    const currentFontSize = config.get<number>('fontSize', 15);
    const currentLineHeightPreview = config.get<number>('lineHeightPreview', 1.5);
    const currentLineHeightSource = config.get<number>('lineHeightSource', 1.6);

    const fonts = ['Cascadia Mono', 'Google Sans', 'IBM Plex Mono', 'Noto Sans SC', 'System'];
    const fontItems: DisplaySettingItem[] = fonts.map((f) => ({
        label: f,
        description: f === currentFont ? '当前' : undefined,
        key: 'fontFamily',
        value: f
    }));

    const sizes = [12, 14, 15, 17, 20, 24, 30];
    const sizeItems: DisplaySettingItem[] = sizes.map((s) => ({
        label: `${s}px`,
        description: s === currentFontSize ? '当前' : undefined,
        key: 'fontSize',
        value: s
    }));

    const linePresets = [
        { label: '1.2（紧凑）', value: 1.2 },
        { label: '1.35', value: 1.35 },
        { label: '1.5（默认）', value: 1.5 },
        { label: '1.6', value: 1.6 },
        { label: '2.0（宽松）', value: 2 }
    ];
    const linePreviewItems: DisplaySettingItem[] = linePresets.map((p) => ({
        label: `预览 · ${p.label}`,
        description: p.value === currentLineHeightPreview ? '当前' : undefined,
        key: 'lineHeightPreview',
        value: p.value
    }));
    const lineSourceItems: DisplaySettingItem[] = linePresets.map((p) => ({
        label: `Markdown · ${p.label}`,
        description: p.value === currentLineHeightSource ? '当前' : undefined,
        key: 'lineHeightSource',
        value: p.value
    }));

    const items: (DisplaySettingItem | vscode.QuickPickItem)[] = [
        { label: '字体系列', kind: vscode.QuickPickItemKind.Separator },
        ...fontItems,
        { label: '字号', kind: vscode.QuickPickItemKind.Separator },
        ...sizeItems,
        { label: '行间距（预览）', kind: vscode.QuickPickItemKind.Separator },
        ...linePreviewItems,
        { label: '行间距（Markdown）', kind: vscode.QuickPickItemKind.Separator },
        ...lineSourceItems
    ];

    const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: '选择一项即可生效',
        title: '显示设置'
    });

    const selected = picked as DisplaySettingItem | undefined;
    if (selected?.key != null && selected?.value != null) {
        await config.update(selected.key, selected.value, vscode.ConfigurationTarget.Global);
        await refreshPreviewIfOpen(previewProvider);
    }
}

// Helper function to extract URI from a tab
function getUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
    const input = tab.input as any;
    if (!input) {
        return undefined;
    }

    // 1. 直接获取 URI
    if (input.uri) {
        return typeof input.uri === 'string' ? vscode.Uri.file(input.uri) : input.uri;
    }

    // 2. 处理 Webview 面板 (coraPreview)
    // 这种情况下，我们需要从面板的原始数据中恢复 URI
    if (input.viewType === 'coraPreview') {
        // 在 VS Code 中，WebviewPanel 的输入可能不直接包含资源 URI
        // 但我们在 PreviewProvider 中保存了 currentUri。
        // 这里需要一种可靠的方式拿回它。
        const possibleRes = input.resource;
        if (possibleRes) {
            return typeof possibleRes === 'string' ? vscode.Uri.file(possibleRes) : possibleRes;
        }
    }

    // 3. 通用预览类型 (Markdown Preview)
    const previewViewTypes = ['markdown.preview', 'vscode.markdown.preview'];
    if (previewViewTypes.includes(input.viewType)) {
        const res = input.resource;
        if (res) {
            return typeof res === 'string' ? vscode.Uri.file(res) : res;
        }
    }

    // 4. 其他备选路径
    const possibleUri = input.resource || input.path || input.document;
    if (possibleUri) {
        const u = typeof possibleUri === 'string' ? vscode.Uri.file(possibleUri) : possibleUri;
        // 过滤掉虚拟的 webview-panel 协议
        if (u.scheme !== 'webview-panel') {
            return u;
        }
    }

    return undefined;
}
