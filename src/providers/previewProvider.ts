import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import { t, htmlLang } from '../utils/i18n';
import {
    parseCommandUri,
    parseFileLink
} from '../utils/previewLinkParser';

/**
 * 自定义 Markdown 预览提供者 (Typora 实时编辑模式)
 * 采用 Milkdown 引擎实现混合预览编辑体验；含 HTML 的文档使用 Marked 只读预览（方案二）
 */
const CONTENT_CACHE_MAX = 20;

export class PreviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;
    private saveTimeout: NodeJS.Timeout | undefined;
    private lastSavedContent: string = '';
    private pendingScrollLine: number | undefined;
    /** 当前面板是否为 Marked 只读模式（含 HTML 文档），用于切换文件时决定是否整页重载 */
    private currentPreviewMode: 'milkdown' | 'marked' = 'milkdown';
    /** URI + mtime 内容缓存，避免同文档重复读盘 */
    private contentCache = new Map<string, { content: string; mtimeMs: number }>();

    constructor(
        private context: vscode.ExtensionContext,
        private onDocumentSaved?: (uri: vscode.Uri) => void,
        private onContentChanged?: (uri: vscode.Uri, content: string) => void
    ) {
        const watcherMd = vscode.workspace.createFileSystemWatcher('**/*.md');
        watcherMd.onDidChange((uri: vscode.Uri) => this.clearContentCacheForUri(uri));
        watcherMd.onDidDelete((uri: vscode.Uri) => this.clearContentCacheForUri(uri));
        context.subscriptions.push(watcherMd);
        const watcherMdc = vscode.workspace.createFileSystemWatcher('**/*.mdc');
        watcherMdc.onDidChange((uri: vscode.Uri) => this.clearContentCacheForUri(uri));
        watcherMdc.onDidDelete((uri: vscode.Uri) => this.clearContentCacheForUri(uri));
        context.subscriptions.push(watcherMdc);
    }

    /**
     * 打开预览面板
     */
    async openPreview(uri: vscode.Uri, line?: number): Promise<void> {
        this.currentUri = uri;
        const fileName = uri.path.split('/').pop() || 'Preview';

        if (this.panel) {
            this.panel.title = `${fileName}${t('preview.panelTitleSuffix')}`;
            // 如果面板已经打开，且我们只是切换文件或刷新，则使用异步消息更新内容，避免重载整个 HTML
            await this.updateContentOnly();
            this.panel.reveal(vscode.ViewColumn.One);

            if (line !== undefined) {
                // 延迟发送 scrollToLine，确保 webview 已处理完 updateContent 并完成 DOM 更新（Milkdown replaceAll 为异步）
                const lineToScroll = line;
                setTimeout(() => {
                    this.panel?.webview.postMessage({ command: 'scrollToLine', line: lineToScroll });
                }, 120);
            }
            return;
        }

        this.pendingScrollLine = line;

        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri);
        this.panel = vscode.window.createWebviewPanel(
            'coraPreview',
            `${fileName}${t('preview.panelTitleSuffix')}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri, ...workspaceFolders],
                retainContextWhenHidden: true
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (!this.panel) return;

            if (msg.command === 'openEditor') {
                console.log('[Cora] Webview requested switch to source for:', this.currentUri?.fsPath);
                vscode.commands.executeCommand('knowledgeBase.openEditor', this.currentUri);
                return;
            }

            if (msg.command === 'openFind') {
                this.panel.reveal(vscode.ViewColumn.One, false);
                const findCommands = [
                    'workbench.action.webview.find',
                    'editor.action.webvieweditor.find',
                    'editor.action.find',
                    'actions.find'
                ];
                for (const cmd of findCommands) {
                    try {
                        await vscode.commands.executeCommand(cmd);
                        break;
                    } catch {
                        // try next fallback command
                    }
                }
                return;
            }

            if (msg.command === 'ready') {
                if (this.pendingScrollLine !== undefined) {
                    this.panel?.webview.postMessage({
                        command: 'scrollToLine',
                        line: this.pendingScrollLine
                    });
                    this.pendingScrollLine = undefined;
                }
                return;
            }

            if (msg.command === 'openLink' && typeof msg.href === 'string' && msg.href.trim()) {
                const href = msg.href.trim();
                try {
                    const cmd = parseCommandUri(href);
                    if (cmd) {
                        await vscode.commands.executeCommand(cmd.commandId, ...cmd.args);
                        return;
                    }
                    const workspace = vscode.workspace.workspaceFolders?.[0];
                    if (!workspace) return;
                    const baseDir = this.currentUri
                        ? path.dirname(this.currentUri.fsPath)
                        : workspace.uri.fsPath;
                    const fileResult = parseFileLink(href, baseDir);
                    if (fileResult) {
                        const uri = vscode.Uri.file(fileResult.resolvedPath);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        const editor = await vscode.window.showTextDocument(doc, { preview: false });
                        if (fileResult.line != null && fileResult.line > 0) {
                            const lineIndex = Math.min(
                                fileResult.line - 1,
                                Math.max(0, doc.lineCount - 1)
                            );
                            const pos = new vscode.Position(lineIndex, 0);
                            editor.selection = new vscode.Selection(pos, pos);
                            editor.revealRange(
                                new vscode.Range(pos, pos),
                                vscode.TextEditorRevealType.InCenter
                            );
                        }
                    }
                } catch (e) {
                    vscode.window.showErrorMessage(t('preview.openLinkFailed', { error: String(e) }));
                }
                return;
            }

            if (msg.command === 'editorUpdate' && typeof msg.content === 'string') {
                const uriToSave = this.currentUri;
                if (!uriToSave) return;
                this.onContentChanged?.(uriToSave, msg.content);

                if (this.saveTimeout) clearTimeout(this.saveTimeout);
                const contentToSave = msg.content;
                this.saveTimeout = setTimeout(async () => {
                    try {
                        if (contentToSave === this.lastSavedContent) return;
                        await vscode.workspace.fs.writeFile(
                            uriToSave,
                            new TextEncoder().encode(contentToSave)
                        );
                        this.clearContentCacheForUri(uriToSave);
                        if (this.currentUri?.toString() === uriToSave.toString()) {
                            this.lastSavedContent = contentToSave;
                        }
                    } catch (e) {
                        console.error('Auto-save failed:', e);
                    }
                }, 800);
            }

            if (msg.command === 'addToChat') {
                const startLine = typeof msg.startLine === 'number' ? msg.startLine : undefined;
                const endLine = typeof msg.endLine === 'number' ? msg.endLine : undefined;
                const text = typeof msg.text === 'string' ? msg.text : '';
                this.addLocationToChat(startLine, endLine, text).catch((e) => {
                    console.error('[Cora] Add to Chat failed:', e);
                });
            }
        });

        await this.updatePreview();
    }

    /**
     * 更新内容 (通过指令而非重载 HTML)
     * 含 HTML 时附带 renderedHtml，供 Marked 只读模式更新预览区。
     * 若从「含 HTML」切到「不含」或反向，整页重载以切换 Milkdown / Marked 模式。
     */
    async updateContentOnly(): Promise<void> {
        if (!this.panel || !this.currentUri) return;
        const uriForThisUpdate = this.currentUri;
        try {
            const content = await this.getContentForUri(uriForThisUpdate);
            if (this.currentUri?.toString() !== uriForThisUpdate.toString()) return;
            this.lastSavedContent = content;
            const newMode = (this.containsHtmlBlock(content) || this.isReportUri(uriForThisUpdate)) ? 'marked' : 'milkdown';
            if (newMode !== this.currentPreviewMode) {
                await this.updatePreview();
                return;
            }
            const payload: { command: string; content: string; uri: string; renderedHtml?: string; imageMap?: Record<string, string> } = {
                command: 'updateContent',
                content,
                uri: uriForThisUpdate.toString()
            };
            if (newMode === 'marked') {
                let html = marked.parse(content) as string;
                html = this.rewriteHtmlImageUrls(html, uriForThisUpdate, this.panel.webview);
                payload.renderedHtml = this.sanitizeHtml(html);
            } else {
                payload.imageMap = this.buildImageMap(content, uriForThisUpdate, this.panel.webview);
            }
            this.panel.webview.postMessage(payload);
        } catch (error) {
            console.error('Error reading file:', error);
        }
    }

    /**
     * 彻底重载 (仅在必要时调用)
     */
    async updatePreview(): Promise<void> {
        if (!this.panel || !this.currentUri) return;
        const uriForThisLoad = this.currentUri;
        try {
            const content = await this.getContentForUri(uriForThisLoad);
            if (this.currentUri?.toString() !== uriForThisLoad.toString()) return;
            this.lastSavedContent = content;
            this.currentPreviewMode = (this.containsHtmlBlock(content) || this.isReportUri(uriForThisLoad)) ? 'marked' : 'milkdown';
            this.panel.webview.html = this.generateHtml(content, uriForThisLoad, this.panel.webview);
        } catch (error) {
            console.error('Error loading editor:', error);
            if (this.panel) this.panel.webview.html = this.getErrorHtml(t('preview.loadError'));
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

    openLocalFindBar(): void {
        if (!this.panel) {
            return;
        }
        this.panel.reveal(vscode.ViewColumn.One, false);
        this.panel.webview.postMessage({ command: 'openLocalFind' });
    }

    /** 使指定 URI 的内容缓存失效（保存或文件变更时调用） */
    private clearContentCacheForUri(uri: vscode.Uri): void {
        this.contentCache.delete(uri.toString());
    }

    /**
     * 根据 URI 取内容：先 stat 取 mtime，命中缓存则返回缓存，否则 readFile 并写入缓存。
     */
    private async getContentForUri(uri: vscode.Uri): Promise<string> {
        const key = uri.toString();
        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(uri.fsPath);
        } catch (e) {
            this.contentCache.delete(key);
            throw e;
        }
        const mtimeMs = stat.mtimeMs;
        const cached = this.contentCache.get(key);
        if (cached && cached.mtimeMs === mtimeMs) return cached.content;
        const content = await fs.promises.readFile(uri.fsPath, 'utf8');
        if (this.contentCache.size >= CONTENT_CACHE_MAX) {
            const firstKey = this.contentCache.keys().next().value;
            if (firstKey !== undefined) this.contentCache.delete(firstKey);
        }
        this.contentCache.set(key, { content, mtimeMs });
        return content;
    }

    /**
     * 供 Custom Editor 使用：根据 uri 和 webview 生成预览 HTML（读文件后调用 generateHtml）
     */
    async getPreviewHtml(uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
        try {
            const content = await this.getContentForUri(uri);
            return this.generateHtml(content, uri, webview);
        } catch {
            return this.getErrorHtml(t('preview.loadError'));
        }
    }

    /**
     * 将「文件 + 行范围」送入 Cursor/VS Code 聊天（与 Cursor 原生行为一致：发送定位引用而非粘贴全文）
     * 若无“添加文件引用”类命令，则粘贴形如 "文件名 (行号)" 的引用字符串。
     */
    private async addLocationToChat(
        startLine?: number,
        endLine?: number,
        fallbackText?: string
    ): Promise<void> {
        if (!this.currentUri) return;
        const uri = this.currentUri;
        const fileName = uri.path.split('/').pop() || '';

        const rangeStr =
            startLine != null && endLine != null
                ? endLine > startLine
                    ? `${fileName} (${t('preview.lineRefRange', { start: startLine, end: endLine })})`
                    : `${fileName} (${t('preview.lineRefSingle', { n: startLine })})`
                : '';

        const originalClipboard = await vscode.env.clipboard.readText();
        try {
            const toPaste = rangeStr.length > 0 ? rangeStr : (fallbackText || '');
            if (toPaste.length === 0) return;

            await vscode.env.clipboard.writeText(toPaste);
            // 优先用 opensidebar 聚焦已有对话，避免新建对话；再回退到 show-ai-chat / workbench
            const showChatCommands = ['aichat.opensidebar', 'aichat.show-ai-chat', 'workbench.action.chat.open'];
            let opened = false;
            for (const cmd of showChatCommands) {
                try {
                    await vscode.commands.executeCommand(cmd);
                    opened = true;
                    break;
                } catch {
                    // 命令不存在则尝试下一个
                }
            }
            if (opened) {
                await new Promise((r) => setTimeout(r, 400));
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            }
        } finally {
            await vscode.env.clipboard.writeText(originalClipboard);
        }
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /** 检测文档是否包含需渲染的 HTML 块/标签，用于走 Marked 只读预览分支 */
    private containsHtmlBlock(content: string): boolean {
        return /<[a-zA-Z][\w-]*(?:\s[^>]*)?\/?>|<\s*\/\s*[a-zA-Z]/.test(content);
    }

    /** 检测文档是否包含 ```mermaid 代码块，用于按需注入 Mermaid 脚本 */
    private containsMermaidBlock(content: string): boolean {
        return /^```\s*mermaid\s*$/im.test(content);
    }

    /** 清洗 marked 输出：移除 script 与事件属性，避免 XSS */
    private sanitizeHtml(html: string): string {
        let out = html
            .replace(/<script\b[\s\S]*?<\/script>/gi, '')
            .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
        return out;
    }

    /** 判断是否为相对路径（非 http/https/data 等），需重写为 webview URI */
    private isRelativeImageSrc(href: string): boolean {
        const t = href.trim();
        return t.length > 0 && !/^https?:\/\//i.test(t) && !/^data:/i.test(t) && !/^#/.test(t);
    }

    /** 收集 Markdown 中相对路径图片的映射表 (relativePath -> webviewUri)，供前端替换 img 用，不改写文档内容 */
    private buildImageMap(markdown: string, documentUri: vscode.Uri, webview: vscode.Webview): Record<string, string> {
        const baseDir = path.dirname(documentUri.fsPath);
        const map: Record<string, string> = {};
        const seen = new Set<string>();
        markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, _alt, src) => {
            const raw = src.trim();
            if (!this.isRelativeImageSrc(raw) || seen.has(raw)) return '';
            seen.add(raw);
            try {
                const absolutePath = path.resolve(baseDir, raw);
                if (fs.existsSync(absolutePath)) {
                    map[raw] = webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
                }
            } catch { /* ignore */ }
            return '';
        });
        return map;
    }

    /** 将 HTML 中相对路径的 img src 重写为 webview 可访问的 URI */
    private rewriteHtmlImageUrls(html: string, documentUri: vscode.Uri, webview: vscode.Webview): string {
        const baseDir = path.dirname(documentUri.fsPath);
        return html.replace(/<img([^>]*)\ssrc=["']([^"']+)["']/gi, (match, attrs, src) => {
            if (!this.isRelativeImageSrc(src)) return match;
            try {
                const absolutePath = path.resolve(baseDir, src.trim());
                if (!fs.existsSync(absolutePath)) return match;
                const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
                return `<img${attrs} src="${webviewUri.toString()}"`;
            } catch {
                return match;
            }
        });
    }

    /**
     * 生成 Marked 只读预览 HTML（方案二：含 HTML 的 md 用 marked 渲染，编辑仅源码）
     */
    private generateMarkedOnlyHtml(markdown: string, uri: vscode.Uri, webview: vscode.Webview): string {
        const extensionUri = this.context.extensionUri;
        const editorMarkedJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'editor-marked.js'));
        const hasMermaid = this.containsMermaidBlock(markdown);
        const mermaidJsUri = hasMermaid ? webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'mermaid.min.js')) : '';

        const nonce = this.getNonce();
        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const fontFamily = config.get<string>('fontFamily', 'Cascadia Mono');
        const fontSize = config.get<number>('fontSize', 15);
        const lineHeightPreview = config.get<number>('lineHeightPreview', 1.5);
        const lineHeightSource = config.get<number>('lineHeightSource', 1.6);

        let fontCss = '';
        let targetFontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        if (fontFamily === 'Cascadia Mono') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'CascadiaMono-Regular.ttf'));
            fontCss = `@font-face { font-family: 'Cascadia Mono Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'Cascadia Mono Custom', monospace";
        } else if (fontFamily === 'Google Sans') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'GoogleSans-Regular.ttf'));
            fontCss = `@font-face { font-family: 'Google Sans Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'Google Sans Custom', sans-serif";
        } else if (fontFamily === 'IBM Plex Mono') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'IBMPlexMono-Regular.ttf'));
            fontCss = `@font-face { font-family: 'IBM Plex Mono Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'IBM Plex Mono Custom', monospace";
        } else if (fontFamily === 'Noto Sans SC') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'NotoSansSC-Regular.ttf'));
            fontCss = `@font-face { font-family: 'Noto Sans SC Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'Noto Sans SC Custom', sans-serif";
        }

        const initialMarkdownJson = JSON.stringify(markdown).replace(/<\/script>/gi, '\\u003c/script>');
        let renderedHtml = marked.parse(markdown) as string;
        renderedHtml = this.rewriteHtmlImageUrls(renderedHtml, uri, webview);
        renderedHtml = this.sanitizeHtml(renderedHtml);
        const initialRenderedJson = JSON.stringify(renderedHtml).replace(/<\/script>/gi, '\\u003c/script>');
        const tabPreview = t('preview.tabPreview');
        const tabMarkdown = t('preview.tabMarkdown');

        const addToChatLabel = t('preview.addToChat');
        const i18nMermaid = JSON.stringify({
            mermaidError: t('preview.mermaidError'),
            mermaidLoading: t('preview.mermaidLoading'),
            mermaidEngineFallback: t('preview.mermaidEngineFallback'),
            mermaidLoadFailed: t('preview.mermaidLoadFailed')
        }).replace(/<\/script>/gi, '\\u003c/script>');
        const mermaidScript = hasMermaid
            ? `window.__CORA_MERMAID__ = "${mermaidJsUri}"; window.__CORA_I18N__ = ${i18nMermaid};`
            : `window.__CORA_MERMAID__ = ""; window.__CORA_I18N__ = ${i18nMermaid};`;
        return `<!DOCTYPE html>
<html lang="${htmlLang()}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src https: http: data: blob: ${webview.cspSource}; connect-src https:;">
    <title>Cora Editor (Marked)</title>
    <style>
        ${fontCss}
        body { font-family: ${targetFontFamily}; background: var(--vscode-editor-background, #fff); color: var(--vscode-editor-foreground, #24292f); margin: 0; padding: 0; overflow: hidden; -webkit-font-smoothing: antialiased; }
        ::highlight(cora-find-hit) { background: var(--vscode-editor-findMatchHighlightBackground, rgba(86, 156, 214, 0.25)); }
        ::highlight(cora-find-active) { background: var(--vscode-editor-findMatchBackground, rgba(86, 156, 214, 0.45)); }
        .top-bar { position: fixed; top: 0; left: 0; right: 0; height: 48px; background: var(--vscode-editor-background, #fff); border-bottom: 1px solid var(--vscode-widget-border, rgba(0,0,0,0.08)); display: flex; align-items: center; justify-content: center; padding: 0 20px; z-index: 1001; }
        .mode-switch-wrapper { position: absolute; right: 40px; display: flex; background: #eee; border-radius: 4px; padding: 2px; gap: 2px; user-select: none; }
        .mode-tab { padding: 3px 12px; font-size: 12px; border-radius: 3px; cursor: pointer; transition: all 0.2s ease; color: #666; min-width: 40px; text-align: center; }
        .mode-tab.active { background: #1a00ff; color: #fff; }
        .mode-tab:not(.active):hover { background: #e0e0e0; }
        .content-area { margin-top: 48px; height: calc(100vh - 48px); overflow: auto; }
        #marked-preview { max-width: 860px; margin: 0 auto; padding: 20px; font-family: ${targetFontFamily} !important; font-size: ${fontSize}px !important; line-height: ${lineHeightPreview} !important; }
        /* 表格：表头浅灰底、常规字重、底部分隔线；数据行白底，链接蓝色下划线 */
        #marked-preview table { border-collapse: collapse; width: 100%; margin: 16px 0; border: 1px solid var(--vscode-widget-border, #e1e4e8); font-size: 14px; background: var(--vscode-editor-background, #fff); }
        #marked-preview thead th { background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa); color: var(--vscode-editor-foreground, #24292f); font-weight: normal; border: 1px solid var(--vscode-widget-border, #e1e4e8); border-bottom: 1px solid var(--vscode-widget-border, #e1e4e8); padding: 8px 12px; text-align: left; }
        #marked-preview tbody td { border: 1px solid var(--vscode-widget-border, #e1e4e8); padding: 8px 12px; text-align: left; background: var(--vscode-editor-background, #fff); }
        #marked-preview tbody td a { color: #0969da; text-decoration: underline; }
        #marked-preview img { max-width: 100%; height: auto; }
        /* 代码块：浅灰底、圆角、等宽字体、保留空格与换行以正确显示 ASCII 树 */
        #marked-preview pre { background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa); border-radius: 6px; padding: 12px 16px; margin: 16px 0; overflow: auto; line-height: 1.45; border: 1px solid var(--vscode-widget-border, #e1e4e8); white-space: pre; }
        #marked-preview pre code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; background: transparent; padding: 0; color: var(--vscode-editor-foreground, #24292f); white-space: pre; }
        #marked-preview code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 0.9em; background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa); padding: 2px 6px; border-radius: 4px; }
        #source-editor-container { width: 100%; height: 100%; display: none; background: var(--vscode-editor-background); }
        .source-editor-wrapper { display: flex; width: 100%; height: 100%; }
        .source-line-numbers { width: 4em; min-width: 4em; padding: 20px 14px 20px 16px; font-family: ${targetFontFamily} !important; font-size: ${fontSize}px !important; line-height: ${lineHeightSource}; color: var(--vscode-editorLineNumber-foreground, #6e7681); text-align: right; user-select: none; overflow-y: auto; overflow-x: hidden; border-right: 1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.1)); white-space: pre; box-sizing: border-box; }
        #source-textarea { flex: 1; min-width: 0; border: none; outline: none; padding: 20px 20px 20px 18px; font-family: ${targetFontFamily} !important; font-size: ${fontSize}px !important; background: transparent; color: var(--vscode-editor-foreground); resize: none; line-height: ${lineHeightSource}; }
        .cora-selection-toolbar { position: absolute; top: 8px; right: 16px; z-index: 100; display: none; flex: none; background: var(--vscode-editorWidget-background, #f3f4f6); border: 1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.12)); border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 2px 4px; font-size: 12px; }
        .cora-selection-toolbar.visible { display: flex; align-items: center; gap: 4px; }
        .cora-selection-toolbar button { padding: 4px 10px; border: none; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; }
    </style>
</head>
<body>
    <div class="top-bar">
        <div class="mode-switch-wrapper">
            <div id="tab-visual" class="mode-tab active">${tabPreview}</div>
            <div id="tab-source" class="mode-tab">${tabMarkdown}</div>
        </div>
    </div>
    <div class="content-area">
        <div id="marked-preview-container" style="width:100%;height:100%;">
            <div id="marked-preview"></div>
        </div>
        <div id="source-editor-container">
            <div class="source-editor-wrapper" style="position: relative;">
                <div id="source-line-numbers" class="source-line-numbers">1</div>
                <textarea id="source-textarea" spellcheck="false"></textarea>
                <div id="cora-selection-toolbar" class="cora-selection-toolbar" aria-hidden="true">
                    <button type="button" id="cora-add-to-chat-btn">${addToChatLabel}</button>
                </div>
            </div>
        </div>
    </div>
    <script type="application/json" id="initial-markdown">${initialMarkdownJson}</script>
    <script type="application/json" id="initial-rendered-html">${initialRenderedJson}</script>
    <script nonce="${nonce}">${mermaidScript}</script>
    <script nonce="${nonce}" src="${editorMarkedJsUri}"></script>
</body>
</html>`;
    }

    /** 是否为 CoraWiki 报告路径（强制走 Marked 预览，避免 Mermaid 卡在 Loading） */
    private isReportUri(uri: vscode.Uri): boolean {
        const normalized = uri.fsPath.replace(/\\/g, '/');
        return normalized.includes('/.cora/reports/') || normalized.includes('/.cora/reports');
    }

    /**
     * 生成 Milkdown 集成 HTML
     */
    private generateHtml(markdown: string, uri: vscode.Uri, webview: vscode.Webview): string {
        if (this.containsHtmlBlock(markdown) || this.isReportUri(uri)) {
            return this.generateMarkedOnlyHtml(markdown, uri, webview);
        }
        const extensionUri = this.context.extensionUri;
        const editorJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'editor.js'));
        const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'milkdown.bundle.js'));
        const hasMermaid = this.containsMermaidBlock(markdown);
        const mermaidJsUri = hasMermaid ? webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'mermaid.min.js')) : '';

        const nonce = this.getNonce();

        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const fontFamily = config.get<string>('fontFamily', 'Cascadia Mono');
        const fontSize = config.get<number>('fontSize', 15);
        const lineHeightPreview = config.get<number>('lineHeightPreview', 1.5);
        const lineHeightSource = config.get<number>('lineHeightSource', 1.6);

        let fontCss = '';
        let targetFontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        if (fontFamily === 'Cascadia Mono') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'CascadiaMono-Regular.ttf'));
            fontCss = `@font-face { font-family: 'Cascadia Mono Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'Cascadia Mono Custom', monospace";
        } else if (fontFamily === 'Google Sans') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'GoogleSans-Regular.ttf'));
            fontCss = `@font-face { font-family: 'Google Sans Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'Google Sans Custom', sans-serif";
        } else if (fontFamily === 'IBM Plex Mono') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'IBMPlexMono-Regular.ttf'));
            fontCss = `@font-face { font-family: 'IBM Plex Mono Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'IBM Plex Mono Custom', monospace";
        } else if (fontFamily === 'Noto Sans SC') {
            const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'fonts', 'NotoSansSC-Regular.ttf'));
            fontCss = `@font-face { font-family: 'Noto Sans SC Custom'; src: url(${fontUri}) format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
            targetFontFamily = "'Noto Sans SC Custom', sans-serif";
        }

        const initialMarkdownJson = JSON.stringify(markdown).replace(/<\/script>/gi, '\\u003c/script>');
        const imageMap = this.buildImageMap(markdown, uri, webview);
        const initialImageMapJson = JSON.stringify(imageMap).replace(/<\/script>/gi, '\\u003c/script>');
        const tabPreview = t('preview.tabPreview');
        const tabMarkdown = t('preview.tabMarkdown');
        const addToChatLabel = t('preview.addToChat');
        const i18nMermaid = JSON.stringify({
            mermaidError: t('preview.mermaidError'),
            mermaidLoading: t('preview.mermaidLoading'),
            mermaidEngineFallback: t('preview.mermaidEngineFallback'),
            mermaidLoadFailed: t('preview.mermaidLoadFailed')
        }).replace(/<\/script>/gi, '\\u003c/script>');

        return `<!DOCTYPE html>
<html lang="${htmlLang()}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' https: ${webview.cspSource}; img-src https: http: data: blob: ${webview.cspSource}; connect-src https:;">
    <title>Cora Editor</title>
    <script nonce="${nonce}">window.__CORA_BUNDLE__ = "${bundleUri}"; window.__CORA_MERMAID__ = "${mermaidJsUri}"; window.__CORA_IMAGE_MAP__ = ${initialImageMapJson}; window.__CORA_I18N__ = ${i18nMermaid};</script>
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
        ::highlight(cora-find-hit) { background: var(--vscode-editor-findMatchHighlightBackground, rgba(86, 156, 214, 0.25)); }
        ::highlight(cora-find-active) { background: var(--vscode-editor-findMatchBackground, rgba(86, 156, 214, 0.45)); }
        #editor {
            max-width: 860px;
            margin: 0 auto;
            min-height: calc(100vh - 48px);
            padding: 20px;
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
            line-height: ${lineHeightPreview} !important;
            outline: none !important;
            border: none !important;
        }
        .milkdown .editor:focus {
            outline: none !important;
        }
        /* 表格样式 - 表头浅灰底、常规字重、底部分隔线；数据行白底，链接蓝色下划线 */
        .milkdown table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
            border: 1px solid var(--vscode-widget-border, #e1e4e8);
            font-size: 14px;
            line-height: 1.35;
            background: var(--vscode-editor-background, #fff) !important;
        }
        .milkdown th, .milkdown td {
            border: 1px solid var(--vscode-widget-border, #e1e4e8);
            padding: 8px 12px;
            text-align: left;
        }
        .milkdown th {
            font-weight: normal;
            background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa) !important;
            color: var(--vscode-editor-foreground, #24292f);
        }
        .milkdown td {
            background: var(--vscode-editor-background, #fff) !important;
        }
        .milkdown td a {
            color: #0969da;
            text-decoration: underline;
        }
        /* 代码块 - 浅灰底、圆角、等宽字体、内边距与行高 */
        .milkdown pre {
            background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa) !important;
            border-radius: 6px;
            padding: 12px 16px;
            margin: 16px 0;
            overflow: auto;
            line-height: 1.45;
            border: 1px solid var(--vscode-widget-border, #e1e4e8);
        }
        .milkdown pre code {
            font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
            font-size: 13px;
            background: transparent !important;
            padding: 0;
        }
        .milkdown :not(pre) > code {
            font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
            font-size: 0.9em;
            background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa);
            padding: 2px 6px;
            border-radius: 4px;
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
            background: #1a00ff;
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
        .source-editor-wrapper {
            display: flex;
            width: 100%;
            height: 100%;
        }
        .source-line-numbers {
            width: 4em;
            min-width: 4em;
            padding: 20px 14px 20px 16px;
            font-family: ${targetFontFamily} !important;
            font-size: ${fontSize}px !important;
            line-height: ${lineHeightSource};
            color: var(--vscode-editorLineNumber-foreground, #6e7681);
            text-align: right;
            user-select: none;
            overflow-y: auto;
            overflow-x: hidden;
            border-right: 1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.1));
            background: var(--vscode-editorLineNumber-activeLineBackground, transparent);
            white-space: pre;
            box-sizing: border-box;
        }
        .source-line-numbers::-webkit-scrollbar {
            width: 0;
            display: none;
        }
        #source-textarea {
            flex: 1;
            min-width: 0;
            border: none;
            outline: none;
            padding: 20px 20px 20px 18px;
            font-family: ${targetFontFamily} !important;
            font-size: ${fontSize}px !important; /* 应用动态字号 */
            background: transparent;
            color: var(--vscode-editor-foreground);
            resize: none;
            line-height: ${lineHeightSource};
        }

        /* 划词浮层 - Add to Chat */
        .cora-selection-toolbar {
            position: absolute;
            top: 8px;
            right: 16px;
            z-index: 100;
            display: none;
            flex: none;
            background: var(--vscode-editorWidget-background, #f3f4f6);
            border: 1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.12));
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 2px 4px;
            font-size: 12px;
            color: var(--vscode-foreground, #24292f);
        }
        .cora-selection-toolbar.visible {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .cora-selection-toolbar button {
            padding: 4px 10px;
            border: none;
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-foreground, #24292f);
        }
        .cora-selection-toolbar button:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(0,0,0,0.06));
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
            <div id="tab-visual" class="mode-tab active">${tabPreview}</div>
            <div id="tab-source" class="mode-tab">${tabMarkdown}</div>
        </div>
    </div>
    
    <div class="content-area">
        <div id="visual-editor-container">
            <div id="editor"></div>
        </div>
        <div id="source-editor-container">
            <div class="source-editor-wrapper" style="position: relative;">
                <div id="source-line-numbers" class="source-line-numbers">1</div>
                <textarea id="source-textarea" spellcheck="false"></textarea>
                <div id="cora-selection-toolbar" class="cora-selection-toolbar" aria-hidden="true">
                    <button type="button" id="cora-add-to-chat-btn">${addToChatLabel}</button>
                </div>
            </div>
        </div>
    </div>

    <script type="application/json" id="initial-markdown">${initialMarkdownJson}</script>
    <script type="module" nonce="${nonce}" src="${editorJsUri}"></script>
</body>
</html>`;
    }

    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="${htmlLang()}">
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
