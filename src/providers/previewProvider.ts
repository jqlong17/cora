import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * 自定义 Markdown 预览提供者 (Typora 实时编辑模式)
 * 采用 Milkdown 引擎实现混合预览编辑体验
 */
export class PreviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;
    private saveTimeout: NodeJS.Timeout | undefined;
    private lastSavedContent: string = '';

    constructor(
        private context: vscode.ExtensionContext,
        private onDocumentSaved?: (uri: vscode.Uri) => void,
        private onContentChanged?: (uri: vscode.Uri, content: string) => void
    ) { }

    /**
     * 打开预览面板
     */
    async openPreview(uri: vscode.Uri): Promise<void> {
        this.currentUri = uri;
        const fileName = uri.path.split('/').pop() || 'Preview';

        if (this.panel) {
            this.panel.title = `${fileName} (Edit)`;
            await this.updatePreview();
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'coraPreview',
            `${fileName} (Edit)`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (!this.panel || !this.currentUri) return;

            if (msg.command === 'openEditor') {
                console.log('[Cora] Webview requested switch to source for:', this.currentUri?.fsPath);
                vscode.commands.executeCommand('knowledgeBase.openEditor', this.currentUri);
                return;
            }

            if (msg.command === 'editorUpdate' && typeof msg.content === 'string') {
                this.onContentChanged?.(this.currentUri, msg.content);

                if (this.saveTimeout) clearTimeout(this.saveTimeout);
                this.saveTimeout = setTimeout(async () => {
                    if (this.currentUri && msg.content !== this.lastSavedContent) {
                        try {
                            await vscode.workspace.fs.writeFile(
                                this.currentUri,
                                new TextEncoder().encode(msg.content)
                            );
                            this.lastSavedContent = msg.content;
                            // 注意：不建议在这里调用 onDocumentSaved 触发全量刷新，因为 Milkdown 会处理局部显示
                        } catch (e) {
                            console.error('Auto-save failed:', e);
                        }
                    }
                }, 800);
            }
        });

        await this.updatePreview();
    }

    /**
     * 更新内容
     */
    async updatePreview(): Promise<void> {
        if (!this.panel || !this.currentUri) return;

        try {
            const content = await fs.promises.readFile(this.currentUri.fsPath, 'utf8');
            this.lastSavedContent = content;
            this.panel.webview.html = this.generateHtml(content, this.currentUri, this.panel.webview);
        } catch (error) {
            console.error('Error loading editor:', error);
            this.panel.webview.html = this.getErrorHtml('无法加载编辑器资源');
        }
    }

    getCurrentUri(): vscode.Uri | undefined { return this.currentUri; }
    hasOpenPanel(): boolean { return this.panel !== undefined; }
    closePreview(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }

    /**
     * 生成 Milkdown 集成 HTML
     */
    private generateHtml(markdown: string, uri: vscode.Uri, webview: vscode.Webview): string {
        const extensionUri = this.context.extensionUri;
        const editorJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'editor.js'));
        const mermaidJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'mermaid.min.js'));
        const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'milkdown.bundle.js'));

        const fontCascadiaUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'CascadiaMono-Regular.ttf'));
        const fontGoogleSansUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'GoogleSans-Regular.ttf'));
        const fontIBMPlexUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'IBMPlexMono-Regular.ttf'));
        const fontNotoSansUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'NotoSansSC-Regular.ttf'));

        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const fontFamily = config.get<string>('fontFamily', 'Cascadia Mono');
        const fontSize = config.get<number>('fontSize', 17);

        let fontCss = '';
        let targetFontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        if (fontFamily === 'Cascadia Mono') {
            fontCss = `@font-face { font-family: 'Cascadia Mono Custom'; src: url(${fontCascadiaUri}) format('truetype'); font-weight: normal; font-style: normal; }`;
            targetFontFamily = "'Cascadia Mono Custom', monospace";
        } else if (fontFamily === 'Google Sans') {
            fontCss = `@font-face { font-family: 'Google Sans Custom'; src: url(${fontGoogleSansUri}) format('truetype'); font-weight: normal; font-style: normal; }`;
            targetFontFamily = "'Google Sans Custom', sans-serif";
        } else if (fontFamily === 'IBM Plex Mono') {
            fontCss = `@font-face { font-family: 'IBM Plex Mono Custom'; src: url(${fontIBMPlexUri}) format('truetype'); font-weight: normal; font-style: normal; }`;
            targetFontFamily = "'IBM Plex Mono Custom', monospace";
        } else if (fontFamily === 'Noto Sans SC') {
            fontCss = `@font-face { font-family: 'Noto Sans SC Custom'; src: url(${fontNotoSansUri}) format('truetype'); font-weight: normal; font-style: normal; }`;
            targetFontFamily = "'Noto Sans SC Custom', sans-serif";
        }

        const initialMarkdownJson = JSON.stringify(markdown).replace(/<\/script>/gi, '\\u003c/script>');

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; font-src ${webview.cspSource}; script-src 'unsafe-inline' https: vscode-resource: vscode-webview-resource:; img-src https: data: vscode-resource: vscode-webview-resource:; connect-src https:;">
    <title>Cora Editor</title>
    <script>window.__CORA_BUNDLE__ = "${bundleUri}"; window.__CORA_MERMAID__ = "${mermaidJsUri}";</script>
    <style>
        ${fontCss}
        body {
            font-family: ${targetFontFamily};
            background: var(--vscode-editor-background, #fff);
            color: var(--vscode-editor-foreground, #24292f);
            margin: 0;
            padding: 0;
            overflow: hidden; /* 核心修复：禁止 body 滚动 */
            -webkit-font-smoothing: antialiased;
        }
        #editor {
            max-width: 860px;
            margin: 0 auto;
            min-height: calc(100vh - 48px);
            padding: 40px;
            font-family: ${targetFontFamily} !important;
        }
        .milkdown {
            box-shadow: none !important;
            background: transparent !important;
            font-size: ${fontSize}px !important; /* 应用动态字号 */
            border: none !important;
            outline: none !important;
        }
        .milkdown .editor {
            font-family: ${targetFontFamily} !important; /* 强制应用字体 */
            padding: 0 !important;
            line-height: 1.8 !important;
            outline: none !important;
            border: none !important;
        }
        .milkdown .editor:focus {
            outline: none !important;
        }
        /* 表格样式优化 - 偏向简约 */
        .milkdown table {
            border-collapse: collapse;
            width: 100%;
            margin: 24px 0;
            border: 1px solid var(--vscode-widget-border, rgba(0,0,0,0.1));
            font-size: 14px;
            background: transparent !important;
        }
        .milkdown th, .milkdown td {
            border: 1px solid var(--vscode-widget-border, rgba(0,0,0,0.1));
            padding: 10px 14px;
            text-align: left;
            background: transparent !important;
        }
        .milkdown th {
            font-weight: 600;
        }

        /* 顶部工具栏 - 独立固定高度 */
        .top-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 48px;
            background: var(--vscode-editor-background, #fff);
            border-bottom: 1px solid var(--vscode-widget-border, rgba(0,0,0,0.08));
            display: flex;
            align-items: center;
            justify-content: center; /* 居中或居右均可，这里选择居右对齐图标感 */
            padding: 0 20px;
            z-index: 1001;
        }

        /* 选项卡切换器 - 固定宽度与位置 */
        .mode-switch-wrapper {
            position: absolute;
            right: 40px;
            display: flex;
            background: #eee;
            border-radius: 4px;
            padding: 2px;
            gap: 2px;
            user-select: none;
        }
        .mode-tab {
            padding: 3px 12px;
            font-size: 12px;
            border-radius: 3px;
            cursor: pointer;
            transition: all 0.2s ease;
            color: #666;
            min-width: 40px;
            text-align: center;
        }
        .mode-tab.active {
            background: #7d5aff;
            color: #fff;
        }
        .mode-tab:not(.active):hover {
            background: #e0e0e0;
        }

        /* 内容区域 */
        .content-area {
            margin-top: 48px;
            height: calc(100vh - 48px);
            overflow: auto;
        }
        
        #source-editor-container {
            width: 100%;
            height: 100%;
            display: none;
            background: var(--vscode-editor-background);
        }
        
        #source-textarea {
            width: 100%;
            height: 100%;
            border: none;
            outline: none;
            padding: 40px;
            font-family: ${targetFontFamily} !important;
            font-size: ${fontSize}px !important; /* 应用动态字号 */
            background: transparent;
            color: var(--vscode-editor-foreground);
            resize: none;
            line-height: 1.6;
        }

        /* 强力隐藏 */
        .mermaid-src-hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="top-bar">
        <div class="mode-switch-wrapper">
            <div id="tab-visual" class="mode-tab active" onclick="switchToVisual()">预览</div>
            <div id="tab-source" class="mode-tab" onclick="switchToSource()">编辑</div>
        </div>
    </div>
    
    <div class="content-area">
        <div id="visual-editor-container">
            <div id="editor"></div>
        </div>
        <div id="source-editor-container">
            <textarea id="source-textarea" spellcheck="false"></textarea>
        </div>
    </div>

    <script type="application/json" id="initial-markdown">${initialMarkdownJson}</script>
    <script type="module" src="${editorJsUri}"></script>
</body>
</html>`;
    }

    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Error</title>
    <style>
        body { font-family: sans-serif; padding: 40px; text-align: center; color: var(--vscode-foreground); }
    </style>
</head>
<body><h2>⚠️ ${message}</h2></body>
</html>`;
    }
}
