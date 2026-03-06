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
                        if (this.panel && this.currentUri?.toString() === uriToSave.toString() && this.currentPreviewMode === 'marked') {
                            let html = marked.parse(contentToSave) as string;
                            html = this.rewriteHtmlImageUrls(html, uriToSave, this.panel.webview);
                            this.panel.webview.postMessage({
                                command: 'updateContent',
                                content: contentToSave,
                                uri: uriToSave.toString(),
                                renderedHtml: this.sanitizeHtml(html)
                            });
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
                return;
            }

            if (msg.command === 'requestImagePathSuggestion') {
                this.handleRequestImagePathSuggestion(msg).then((result) => {
                    if (result) this.panel?.webview.postMessage({ command: 'imagePathSuggestionResult', ...result });
                }).catch((e) => {
                    console.error('[Cora] requestImagePathSuggestion failed:', e);
                    this.panel?.webview.postMessage({ command: 'imagePathSuggestionResult', error: String(e), requestKind: msg.requestKind });
                });
                return;
            }

            if (msg.command === 'saveImageFromBase64') {
                this.handleSaveImageFromBase64(msg).then((result) => {
                    if (!result) return;
                    const command = result.requestKind === 'switchToRef' ? 'imageSwitchToRefResult' : 'pasteImageResult';
                    this.panel?.webview.postMessage({ command, ...result });
                }).catch((e) => {
                    console.error('[Cora] saveImageFromBase64 failed:', e);
                    const command = msg.requestKind === 'switchToRef' ? 'imageSwitchToRefResult' : 'pasteImageResult';
                    this.panel?.webview.postMessage({ command, error: String(e) });
                });
                return;
            }

            if (msg.command === 'pasteImage') {
                this.handlePasteImage(msg).catch((e) => {
                    console.error('[Cora] pasteImage failed:', e);
                    this.panel?.webview.postMessage({ command: 'pasteImageResult', error: String(e) });
                });
                return;
            }

            if (msg.command === 'requestPreviewUpdate' && typeof msg.content === 'string') {
                if (this.panel && this.currentUri?.toString() && this.currentPreviewMode === 'marked') {
                    try {
                        let html = marked.parse(msg.content) as string;
                        html = this.rewriteHtmlImageUrls(html, this.currentUri, this.panel.webview);
                        this.panel.webview.postMessage({
                            command: 'updateContent',
                            content: msg.content,
                            uri: this.currentUri.toString(),
                            renderedHtml: this.sanitizeHtml(html)
                        });
                    } catch (e) {
                        console.error('[Cora] requestPreviewUpdate render failed:', e);
                    }
                }
                return;
            }

            if (msg.command === 'imageSwitchToRef') {
                this.handleImageSwitchToRef(msg).catch((e) => {
                    console.error('[Cora] imageSwitchToRef failed:', e);
                    this.panel?.webview.postMessage({ command: 'imageSwitchToRefResult', error: String(e) });
                });
                return;
            }

            if (msg.command === 'imageSwitchToBase64') {
                this.handleImageSwitchToBase64(msg).then((result) => {
                    if (result) this.panel?.webview.postMessage({ command: 'imageSwitchToBase64Result', ...result });
                }).catch((e) => {
                    console.error('[Cora] imageSwitchToBase64 failed:', e);
                    this.panel?.webview.postMessage({ command: 'imageSwitchToBase64Result', error: String(e) });
                });
                return;
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

    postMessageToWebview(message: { command: string }): void {
        this.panel?.webview.postMessage(message);
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

    /** 建议默认图片保存路径：当前 .md 同目录下 images/image-YYYYMMDD-NNN.png，避免覆盖 */
    private async suggestDefaultImagePath(documentUri: vscode.Uri): Promise<string> {
        const docDir = path.dirname(documentUri.fsPath);
        const imagesDir = path.join(docDir, 'images');
        const today = new Date();
        const dateStr = today.getFullYear() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0');
        const prefix = `image-${dateStr}-`;
        let maxN = 0;
        try {
            if (!fs.existsSync(imagesDir)) return `images/${prefix}001.png`;
            const names = await fs.promises.readdir(imagesDir);
            for (const name of names) {
                const m = name.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)\\.(png|jpe?g|gif|webp)$`, 'i'));
                if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
            }
        } catch { /* ignore */ }
        const nextN = String(maxN + 1).padStart(3, '0');
        return `images/${prefix}${nextN}.png`;
    }

    private async handleRequestImagePathSuggestion(msg: { documentUri?: string; requestKind?: string }): Promise<{ suggestedPath: string; requestKind?: string } | undefined> {
        const documentUriStr = typeof msg.documentUri === 'string' ? msg.documentUri : undefined;
        if (!documentUriStr) return undefined;
        const documentUri = vscode.Uri.parse(documentUriStr);
        const suggestedPath = await this.suggestDefaultImagePath(documentUri);
        return { suggestedPath, requestKind: msg.requestKind };
    }

    private async handleSaveImageFromBase64(msg: {
        documentUri?: string;
        imageDataBase64?: string;
        pathInput?: string;
        insertAs?: string;
        requestKind?: string;
    }): Promise<{ requestKind?: string; pathForRef: string; insertAs?: 'ref' | 'base64'; previewSrc?: string } | undefined> {
        const documentUriStr = typeof msg.documentUri === 'string' ? msg.documentUri : undefined;
        const imageDataBase64 = typeof msg.imageDataBase64 === 'string' ? msg.imageDataBase64 : undefined;
        const pathInput = typeof msg.pathInput === 'string' ? msg.pathInput.trim().replace(/\\/g, '/') : '';
        if (!documentUriStr || !imageDataBase64 || !pathInput || pathInput.includes('..')) return undefined;
        const documentUri = vscode.Uri.parse(documentUriStr);
        const docDir = path.dirname(documentUri.fsPath);
        const absolutePath = path.resolve(docDir, pathInput);
        const dir = path.dirname(absolutePath);
        await fs.promises.mkdir(dir, { recursive: true });
        const buf = Buffer.from(imageDataBase64, 'base64');
        await fs.promises.writeFile(absolutePath, buf);
        this.clearContentCacheForUri(documentUri);
        const previewSrc = this.panel?.webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
        return {
            requestKind: msg.requestKind,
            pathForRef: pathInput,
            insertAs: msg.insertAs === 'base64' ? 'base64' : 'ref',
            previewSrc,
        };
    }

    private getPasteImageDialogHtml(suggestedPath: string, options?: { convertToRefOnly?: boolean }): string {
        const convertToRefOnly = options?.convertToRefOnly === true;
        const title = convertToRefOnly ? t('preview.pasteImageConvertToRefTitle') : t('preview.pasteImageTitle');
        const pathPrompt = t('preview.pasteImagePathPrompt');
        const pathPlaceholder = t('preview.pasteImagePathPlaceholder');
        const insertPrompt = t('preview.pasteImageInsertTypePrompt');
        const refLabel = t('preview.pasteImageInsertTypeRef');
        const base64Label = t('preview.pasteImageInsertTypeBase64');
        const confirmLabel = t('preview.pasteImageConfirm');
        const cancelLabel = t('preview.pasteImageCancel');
        const escapedPath = suggestedPath.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const insertTypeBlock = convertToRefOnly ? '' : `
        <div class="field">
            <label>${insertPrompt.replace(/</g, '&lt;')}</label>
            <div class="radio-group">
                <label><input type="radio" name="insertAs" value="ref" checked /> ${refLabel.replace(/</g, '&lt;')}</label>
                <label><input type="radio" name="insertAs" value="base64" /> ${base64Label.replace(/</g, '&lt;')}</label>
            </div>
        </div>`;
        return `<!DOCTYPE html>
<html lang="${htmlLang()}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 20px; }
        h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; }
        .field { margin-bottom: 16px; }
        .field label { display: block; margin-bottom: 4px; color: var(--vscode-input-foreground); }
        .field input[type="text"] { width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 13px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; }
        .field input[type="text"]:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
        .radio-group { display: flex; flex-direction: column; gap: 8px; }
        .radio-group label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .radio-group input { margin: 0; }
        .actions { margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end; }
        .actions button { padding: 6px 14px; font-size: 13px; border-radius: 4px; cursor: pointer; border: 1px solid var(--vscode-button-border); }
        .actions button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .actions button.primary:hover { background: var(--vscode-button-hoverBackground); }
        .actions button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .actions button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .error { font-size: 12px; color: var(--vscode-errorForeground); margin-top: 4px; display: none; }
    </style>
</head>
<body>
    <h2>${title.replace(/</g, '&lt;')}</h2>
    <form id="form">
        <div class="field">
            <label for="path">${pathPrompt.replace(/</g, '&lt;')}</label>
            <input type="text" id="path" name="path" value="${escapedPath}" placeholder="${pathPlaceholder.replace(/"/g, '&quot;')}" autocomplete="off" />
            <div class="error" id="pathError"></div>
        </div>
        ${insertTypeBlock}
        <div class="actions">
            <button type="button" class="secondary" id="btnCancel">${cancelLabel.replace(/</g, '&lt;')}</button>
            <button type="submit" class="primary" id="btnConfirm">${confirmLabel.replace(/</g, '&lt;')}</button>
        </div>
    </form>
    <script>
        (function() {
            var vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
            if (!vscode) return;
            var convertToRefOnly = ${convertToRefOnly ? 'true' : 'false'};
            var form = document.getElementById('form');
            var pathInput = document.getElementById('path');
            var pathError = document.getElementById('pathError');
            var btnCancel = document.getElementById('btnCancel');
            function validate() {
                var val = (pathInput.value || '').trim().replace(/\\\\/g, '/');
                if (!val) { pathError.textContent = '路径不能为空'; pathError.style.display = 'block'; return false; }
                if (val.indexOf('..') !== -1) { pathError.textContent = '路径不能包含 ..'; pathError.style.display = 'block'; return false; }
                pathError.style.display = 'none';
                return true;
            }
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                if (!validate()) return;
                var val = pathInput.value.trim().replace(/\\\\/g, '/');
                if (convertToRefOnly) {
                    vscode.postMessage({ pathInput: val, convertToRef: true });
                } else {
                    var insertAs = form.insertAs.value;
                    vscode.postMessage({ pathInput: val, insertAs: insertAs });
                }
            });
            btnCancel.addEventListener('click', function() {
                vscode.postMessage({ cancel: true });
            });
        })();
    </script>
</body>
</html>`;
    }

    private showPasteImageDialog(
        suggestedPath: string,
        documentUri: vscode.Uri,
        imageDataBase64: string,
        mimeType: string
    ): void {
        const panel = vscode.window.createWebviewPanel(
            'coraPasteImageDialog',
            t('preview.pasteImageTitle'),
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        panel.webview.html = this.getPasteImageDialogHtml(suggestedPath);

        panel.webview.onDidReceiveMessage(async (msg: { pathInput?: string; insertAs?: string; cancel?: boolean; convertToRef?: boolean }) => {
            if (msg.cancel) {
                panel.dispose();
                return;
            }
            const pathInput = typeof msg.pathInput === 'string' ? msg.pathInput.trim().replace(/\\/g, '/') : '';
            if (!pathInput || pathInput.includes('..')) {
                panel.dispose();
                return;
            }
            const docDir = path.dirname(documentUri.fsPath);
            const absolutePath = path.resolve(docDir, pathInput);
            const dir = path.dirname(absolutePath);
            try {
                await fs.promises.mkdir(dir, { recursive: true });
                const buf = Buffer.from(imageDataBase64, 'base64');
                await fs.promises.writeFile(absolutePath, buf);
                this.clearContentCacheForUri(documentUri);
                const previewSrc = this.panel?.webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
                if (msg.convertToRef) {
                    this.panel?.webview.postMessage({
                        command: 'imageSwitchToRefResult',
                        pathForRef: pathInput,
                        previewSrc
                    });
                } else {
                    const insertAs = msg.insertAs === 'base64' ? 'base64' as const : 'ref' as const;
                    this.panel?.webview.postMessage({
                        command: 'pasteImageResult',
                        pathForRef: pathInput,
                        insertAs,
                        previewSrc
                    });
                }
            } catch (e) {
                console.error('[Cora] Paste image save failed:', e);
                this.panel?.webview.postMessage(msg.convertToRef
                    ? { command: 'imageSwitchToRefResult', error: String(e) }
                    : { command: 'pasteImageResult', error: String(e) });
            }
            panel.dispose();
        });
    }

    /** 内嵌图转为引用文件：弹窗选路径后保存并回发 imageSwitchToRefResult */
    private showConvertImageToRefDialog(
        suggestedPath: string,
        documentUri: vscode.Uri,
        imageDataBase64: string
    ): void {
        const panel = vscode.window.createWebviewPanel(
            'coraConvertImageToRefDialog',
            t('preview.pasteImageConvertToRefTitle'),
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        panel.webview.html = this.getPasteImageDialogHtml(suggestedPath, { convertToRefOnly: true });

        panel.webview.onDidReceiveMessage(async (msg: { pathInput?: string; cancel?: boolean }) => {
            if (msg.cancel) {
                panel.dispose();
                return;
            }
            const pathInput = typeof msg.pathInput === 'string' ? msg.pathInput.trim().replace(/\\/g, '/') : '';
            if (!pathInput || pathInput.includes('..')) {
                panel.dispose();
                return;
            }
            const docDir = path.dirname(documentUri.fsPath);
            const absolutePath = path.resolve(docDir, pathInput);
            const dir = path.dirname(absolutePath);
            try {
                await fs.promises.mkdir(dir, { recursive: true });
                const buf = Buffer.from(imageDataBase64, 'base64');
                await fs.promises.writeFile(absolutePath, buf);
                this.clearContentCacheForUri(documentUri);
                const previewSrc = this.panel?.webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
                this.panel?.webview.postMessage({
                    command: 'imageSwitchToRefResult',
                    pathForRef: pathInput,
                    previewSrc
                });
            } catch (e) {
                console.error('[Cora] Convert image to ref failed:', e);
                this.panel?.webview.postMessage({ command: 'imageSwitchToRefResult', error: String(e) });
            }
            panel.dispose();
        });
    }

    private async handlePasteImage(msg: { documentUri?: string; imageDataBase64?: string; mimeType?: string }): Promise<void> {
        const documentUriStr = typeof msg.documentUri === 'string' ? msg.documentUri : undefined;
        const imageDataBase64 = typeof msg.imageDataBase64 === 'string' ? msg.imageDataBase64 : undefined;
        if (!documentUriStr || !imageDataBase64) return;
        const documentUri = vscode.Uri.parse(documentUriStr);
        const suggested = await this.suggestDefaultImagePath(documentUri);
        this.showPasteImageDialog(suggested, documentUri, imageDataBase64, msg.mimeType || 'image/png');
    }

    private async handleImageSwitchToRef(msg: { documentUri?: string; imageDataBase64?: string }): Promise<void> {
        const documentUriStr = typeof msg.documentUri === 'string' ? msg.documentUri : undefined;
        const imageDataBase64 = typeof msg.imageDataBase64 === 'string' ? msg.imageDataBase64 : undefined;
        if (!documentUriStr || !imageDataBase64) return;
        const documentUri = vscode.Uri.parse(documentUriStr);
        const suggested = await this.suggestDefaultImagePath(documentUri);
        this.showConvertImageToRefDialog(suggested, documentUri, imageDataBase64);
    }

    private async handleImageSwitchToBase64(msg: { documentUri?: string; path?: string }): Promise<{ imageDataBase64: string; mimeType: string } | undefined> {
        const documentUriStr = typeof msg.documentUri === 'string' ? msg.documentUri : undefined;
        const relPath = typeof msg.path === 'string' ? msg.path.trim() : undefined;
        if (!documentUriStr || !relPath) return undefined;
        const documentUri = vscode.Uri.parse(documentUriStr);
        const docDir = path.dirname(documentUri.fsPath);
        const absolutePath = path.resolve(docDir, relPath);
        const buf = await fs.promises.readFile(absolutePath);
        const ext = path.extname(absolutePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png';
        return { imageDataBase64: buf.toString('base64'), mimeType };
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
        const blockLikeTag = /<\s*\/?\s*(script|style|iframe|canvas|svg|math|video|audio|picture|source|table|thead|tbody|tfoot|tr|td|th|colgroup|col|details|summary|form|input|button|select|option|textarea|figure|figcaption|section|article|aside|nav|header|footer|main|div)\b/i;
        return blockLikeTag.test(content);
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

    /** 将 HTML 中相对路径的 img src 重写为 webview 可访问的 URI，并保留 data-cora-src 供悬浮切换引用/base64 使用 */
    private rewriteHtmlImageUrls(html: string, documentUri: vscode.Uri, webview: vscode.Webview): string {
        const baseDir = path.dirname(documentUri.fsPath);
        return html.replace(/<img([^>]*)\ssrc=["']([^"']+)["']/gi, (match, attrs, src) => {
            if (!this.isRelativeImageSrc(src)) return match;
            try {
                const absolutePath = path.resolve(baseDir, src.trim());
                if (!fs.existsSync(absolutePath)) return match;
                const webviewUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
                const relPath = src.trim().replace(/\\/g, '/');
                return `<img${attrs} src="${webviewUri.toString()}" data-cora-src="${relPath.replace(/"/g, '&quot;')}"`;
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
        const fontSize = config.get<number>('fontSize', 13);
        const fontSizePreview = config.get<number>('fontSizePreview', 15);
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
        const copyPreviewLabel = t('preview.copyPreview');
        const copiedToClipboardLabel = t('preview.copiedToClipboard');

        const addToChatLabel = t('preview.addToChat');
        const imageSwitchToRefLabel = t('preview.imageSwitchToRef');
        const imageSwitchToBase64Label = t('preview.imageSwitchToBase64');
        const imageDialogLabels = JSON.stringify({
            pasteTitle: t('preview.pasteImageTitle'),
            convertToRefTitle: t('preview.pasteImageConvertToRefTitle'),
            pathPrompt: t('preview.pasteImagePathPrompt'),
            pathPlaceholder: t('preview.pasteImagePathPlaceholder'),
            insertPrompt: t('preview.pasteImageInsertTypePrompt'),
            ref: t('preview.pasteImageInsertTypeRef'),
            base64: t('preview.pasteImageInsertTypeBase64'),
            confirm: t('preview.pasteImageConfirm'),
            cancel: t('preview.pasteImageCancel')
        }).replace(/<\/script>/gi, '\\u003c/script>');
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
        .copy-preview-btn { position: absolute; left: 20px; padding: 4px 12px; font-size: 12px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); background: #eee; color: #666; cursor: pointer; }
        .copy-preview-btn:hover { background: #e0e0e0; }
        .mode-tab { padding: 3px 12px; font-size: 12px; border-radius: 3px; cursor: pointer; transition: all 0.2s ease; color: #666; min-width: 40px; text-align: center; }
        .mode-tab.active { background: #d1d5db; color: #374151; }
        .mode-tab:not(.active):hover { background: #e0e0e0; }
        .content-area { margin-top: 48px; height: calc(100vh - 48px); overflow: auto; }
        #marked-preview { max-width: 860px; margin: 0 auto; padding: 20px 32px; font-family: ${targetFontFamily} !important; font-size: ${fontSizePreview}px !important; line-height: ${lineHeightPreview} !important; }
        /* 标题 */
        #marked-preview h1 { font-size: 1.8em; font-weight: 600; margin: 2em 0 0.4em; padding-bottom: 0.25em; border-bottom: 1px solid var(--vscode-widget-border, #e5e7eb); line-height: 1.25; }
        #marked-preview h1:first-child { margin-top: 0; }
        #marked-preview h2 { font-size: 1.4em; font-weight: 600; margin: 1.6em 0 0.35em; line-height: 1.3; }
        #marked-preview h3 { font-size: 1.15em; font-weight: 600; margin: 1.3em 0 0.3em; line-height: 1.35; }
        #marked-preview h4 { font-size: 1em; font-weight: 600; margin: 1.1em 0 0.25em; line-height: 1.4; }
        #marked-preview h5 { font-size: 0.9em; font-weight: 600; margin: 1em 0 0.2em; line-height: 1.4; color: var(--vscode-descriptionForeground, #656d76); }
        #marked-preview h6 { font-size: 0.85em; font-weight: 600; margin: 1em 0 0.2em; line-height: 1.4; color: var(--vscode-descriptionForeground, #656d76); }
        /* 段落与列表 */
        #marked-preview p { margin: 0.6em 0; }
        #marked-preview ul, #marked-preview ol { margin: 0.4em 0; padding-left: 1.8em; }
        #marked-preview li { margin: 0.15em 0; }
        #marked-preview li > p { margin: 0.25em 0; }
        /* 引用块 */
        #marked-preview blockquote { margin: 0.8em 0; padding: 2px 0 2px 14px; border-left: 3px solid var(--vscode-widget-border, #d1d5db); color: var(--vscode-descriptionForeground, #656d76); }
        #marked-preview blockquote p { margin: 0.3em 0; }
        /* 分隔线 */
        #marked-preview hr { border: none; border-top: 1px solid var(--vscode-widget-border, #e5e7eb); margin: 1.5em 0; }
        /* 链接 */
        #marked-preview a { color: #0969da; text-decoration: none; }
        #marked-preview a:hover { text-decoration: underline; }
        /* 图片 */
        #marked-preview img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5em 0; }
        /* 表格 */
        #marked-preview table { border-collapse: collapse; table-layout: auto; width: auto; max-width: 100%; min-width: 50%; margin: 1em 0; font-size: 15px; line-height: 1.4; background: var(--vscode-editor-background, #fff); border: 1px solid var(--vscode-widget-border, #e5e7eb); }
        #marked-preview thead th { background: rgba(0,0,0,0.025); color: var(--vscode-editor-foreground, #24292f); font-weight: 500; font-size: 15px; letter-spacing: 0.02em; white-space: nowrap; border: 1px solid var(--vscode-widget-border, #e5e7eb); padding: 6px 12px; text-align: left; }
        #marked-preview tbody td { border: 1px solid var(--vscode-widget-border, #e5e7eb); padding: 2px 12px; text-align: left; background: var(--vscode-editor-background, #fff); }
        #marked-preview tbody tr:hover td { background: var(--vscode-list-hoverBackground, rgba(0,0,0,0.02)); }
        #marked-preview tbody td a { color: #0969da; text-decoration: none; word-break: break-all; }
        #marked-preview tbody td a:hover { text-decoration: underline; }
        #marked-preview tbody td code { font-size: 15px; padding: 1px 5px; border-radius: 3px; background: var(--vscode-editor-inactiveSelectionBackground, #f3f4f6); }
        /* 代码块 */
        #marked-preview pre { background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa); border-radius: 6px; padding: 12px 16px; margin: 1em 0; overflow: auto; line-height: 1.45; border: 1px solid var(--vscode-widget-border, #e1e4e8); white-space: pre; }
        #marked-preview pre code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; background: transparent; padding: 0; color: var(--vscode-editor-foreground, #24292f); white-space: pre; }
        #marked-preview code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 0.9em; background: var(--vscode-editor-inactiveSelectionBackground, #f6f8fa); padding: 2px 6px; border-radius: 4px; }
        /* 加粗与强调 */
        #marked-preview strong { font-weight: 600; }
        #marked-preview em { font-style: italic; }
        #source-editor-container { width: 100%; height: 100%; display: none; background: var(--vscode-editor-background); }
        .source-editor-wrapper { display: flex; width: 100%; height: 100%; }
        .source-line-numbers { width: 4em; min-width: 4em; padding: 20px 14px 20px 16px; font-family: ${targetFontFamily} !important; font-size: ${fontSize}px !important; line-height: ${lineHeightSource}; color: var(--vscode-editorLineNumber-foreground, #6e7681); text-align: right; user-select: none; overflow-y: auto; overflow-x: hidden; border-right: 1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.1)); white-space: pre; box-sizing: border-box; }
        #source-textarea { flex: 1; min-width: 0; border: none; outline: none; padding: 20px 20px 20px 18px; font-family: ${targetFontFamily} !important; font-size: ${fontSize}px !important; background: transparent; color: var(--vscode-editor-foreground); resize: none; line-height: ${lineHeightSource}; }
        .cora-selection-toolbar { position: absolute; top: 8px; right: 16px; z-index: 100; display: none; flex: none; background: var(--vscode-editorWidget-background, #f3f4f6); border: 1px solid var(--vscode-editorWidget-border, rgba(0,0,0,0.12)); border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 2px 4px; font-size: 12px; }
        .cora-selection-toolbar.visible { display: flex; align-items: center; gap: 4px; }
        .cora-selection-toolbar button { padding: 4px 10px; border: none; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; }
        .cora-image-wrap { position: relative; display: inline-block; }
        .cora-image-wrap img { display: block; max-width: 100%; }
        .cora-image-actions { position: absolute; top: 6px; right: 6px; display: none; flex-direction: row; gap: 4px; z-index: 10; }
        .cora-image-wrap:hover .cora-image-actions { display: flex; }
        .cora-image-actions button { padding: 2px 8px; font-size: 11px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); background: var(--vscode-editorWidget-background, #fff); color: var(--vscode-foreground, #333); cursor: pointer; }
        .cora-image-actions button:hover { background: var(--vscode-toolbar-hoverBackground, #e5e7eb); }
        .cora-image-actions button:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
    </style>
</head>
<body>
    <div class="top-bar">
        <button type="button" id="cora-copy-preview-btn" class="copy-preview-btn" data-copied="${copiedToClipboardLabel}" aria-label="${copyPreviewLabel}">${copyPreviewLabel}</button>
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
    <script nonce="${nonce}">window.__CORA_DOCUMENT_URI__=${JSON.stringify(uri.toString())};window.__CORA_IMAGE_INSERT_LABELS__={ref:${JSON.stringify(imageSwitchToRefLabel)},base64:${JSON.stringify(imageSwitchToBase64Label)}};window.__CORA_IMAGE_DIALOG_LABELS__=${imageDialogLabels};${mermaidScript}</script>
    <script nonce="${nonce}">${this.getTableLayoutScript()}</script>
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
        const historyBundleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'prosemirror-history.bundle.js'));
        const hasMermaid = this.containsMermaidBlock(markdown);
        const mermaidJsUri = hasMermaid ? webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'mermaid.min.js')) : '';

        const nonce = this.getNonce();

        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const fontFamily = config.get<string>('fontFamily', 'Cascadia Mono');
        const fontSize = config.get<number>('fontSize', 13);
        const fontSizePreview = config.get<number>('fontSizePreview', 15);
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
        const copyPreviewLabel = t('preview.copyPreview');
        const copiedToClipboardLabel = t('preview.copiedToClipboard');
        const addToChatLabel = t('preview.addToChat');
        const imageSwitchToRefLabelMilk = t('preview.imageSwitchToRef');
        const imageSwitchToBase64LabelMilk = t('preview.imageSwitchToBase64');
        const imageDialogLabels = JSON.stringify({
            pasteTitle: t('preview.pasteImageTitle'),
            convertToRefTitle: t('preview.pasteImageConvertToRefTitle'),
            pathPrompt: t('preview.pasteImagePathPrompt'),
            pathPlaceholder: t('preview.pasteImagePathPlaceholder'),
            insertPrompt: t('preview.pasteImageInsertTypePrompt'),
            ref: t('preview.pasteImageInsertTypeRef'),
            base64: t('preview.pasteImageInsertTypeBase64'),
            confirm: t('preview.pasteImageConfirm'),
            cancel: t('preview.pasteImageCancel')
        }).replace(/<\/script>/gi, '\\u003c/script>');
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
    <script nonce="${nonce}">window.__CORA_DOCUMENT_URI__=${JSON.stringify(uri.toString())};window.__CORA_IMAGE_INSERT_LABELS__={ref:${JSON.stringify(imageSwitchToRefLabelMilk)},base64:${JSON.stringify(imageSwitchToBase64LabelMilk)}};window.__CORA_IMAGE_DIALOG_LABELS__=${imageDialogLabels};window.__CORA_BUNDLE__ = "${bundleUri}"; window.__CORA_HISTORY_BUNDLE__ = "${historyBundleUri}"; window.__CORA_MERMAID__ = "${mermaidJsUri}"; window.__CORA_IMAGE_MAP__ = ${initialImageMapJson}; window.__CORA_I18N__ = ${i18nMermaid};</script>
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
            font-size: ${fontSizePreview}px !important; /* 预览模式字号 */
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
        .milkdown .ProseMirror {
            caret-color: var(--vscode-editorCursor-foreground, currentColor);
            cursor: text;
            min-height: calc(100vh - 120px);
        }
        .milkdown .ProseMirror-focused {
            outline: none !important;
        }
        /* 标题 */
        .milkdown h1 { font-size: 1.8em; font-weight: 600; margin: 2em 0 0.4em; padding-bottom: 0.25em; border-bottom: 1px solid var(--vscode-widget-border, #e5e7eb); line-height: 1.25; }
        .milkdown h1:first-child { margin-top: 0; }
        .milkdown h2 { font-size: 1.4em; font-weight: 600; margin: 1.6em 0 0.35em; line-height: 1.3; }
        .milkdown h3 { font-size: 1.15em; font-weight: 600; margin: 1.3em 0 0.3em; line-height: 1.35; }
        .milkdown h4 { font-size: 1em; font-weight: 600; margin: 1.1em 0 0.25em; line-height: 1.4; }
        .milkdown h5 { font-size: 0.9em; font-weight: 600; margin: 1em 0 0.2em; line-height: 1.4; color: var(--vscode-descriptionForeground, #656d76); }
        .milkdown h6 { font-size: 0.85em; font-weight: 600; margin: 1em 0 0.2em; line-height: 1.4; color: var(--vscode-descriptionForeground, #656d76); }
        /* 段落与列表 */
        .milkdown p { margin: 0.6em 0; }
        .milkdown ul, .milkdown ol { margin: 0.4em 0; padding-left: 1.8em; }
        .milkdown li { margin: 0.15em 0; }
        .milkdown li > p { margin: 0.25em 0; }
        /* 引用块 */
        .milkdown blockquote { margin: 0.8em 0; padding: 2px 0 2px 14px; border-left: 3px solid var(--vscode-widget-border, #d1d5db); color: var(--vscode-descriptionForeground, #656d76); }
        .milkdown blockquote p { margin: 0.3em 0; }
        /* 分隔线 */
        .milkdown hr { border: none; border-top: 1px solid var(--vscode-widget-border, #e5e7eb); margin: 1.5em 0; }
        /* 链接 */
        .milkdown a { color: #0969da; text-decoration: none; }
        .milkdown a:hover { text-decoration: underline; }
        /* 图片 */
        .milkdown img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5em 0; }
        /* 加粗与强调 */
        .milkdown strong { font-weight: 600; }
        .milkdown em { font-style: italic; }
        /* 表格 */
        .milkdown table {
            border-collapse: collapse;
            table-layout: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 16px 0;
            border: 1px solid var(--vscode-widget-border, #e5e7eb);
            font-size: 15px;
            line-height: 1.4;
            background: var(--vscode-editor-background, #fff) !important;
        }
        .milkdown table colgroup col { width: 0 !important; min-width: 0 !important; }
        .milkdown th, .milkdown td {
            border: 1px solid var(--vscode-widget-border, #e5e7eb);
            padding: 2px 12px;
            text-align: left;
            width: auto !important;
            min-width: 0 !important;
        }
        .milkdown th {
            font-weight: 500;
            font-size: 15px;
            letter-spacing: 0.02em;
            white-space: nowrap !important;
            background: rgba(0,0,0,0.025) !important;
            color: var(--vscode-editor-foreground, #24292f);
            padding: 6px 12px;
        }
        .milkdown td {
            background: var(--vscode-editor-background, #fff) !important;
        }
        .milkdown tbody tr:hover td {
            background: var(--vscode-list-hoverBackground, rgba(0,0,0,0.02)) !important;
        }
        .milkdown td a {
            color: #0969da;
            text-decoration: none;
            word-break: break-all;
        }
        .milkdown td a:hover {
            text-decoration: underline;
        }
        .milkdown td code {
            font-size: 15px;
            padding: 1px 5px;
            border-radius: 3px;
            background: var(--vscode-editor-inactiveSelectionBackground, #f3f4f6);
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

        /* 复制按钮 - 顶部左侧，与右侧未激活 tab 同色弱化 */
        .copy-preview-btn {
            position: absolute;
            left: 20px;
            padding: 4px 12px;
            font-size: 12px;
            border-radius: 4px;
            border: 1px solid rgba(0,0,0,0.08);
            background: #eee;
            color: #666;
            cursor: pointer;
        }
        .copy-preview-btn:hover {
            background: #e0e0e0;
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
            background: #d1d5db;
            color: #374151;
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

        .cora-image-floating-actions { position: fixed; display: none; flex-direction: row; gap: 4px; z-index: 1200; padding: 4px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.15); background: var(--vscode-editorWidget-background, #fff); box-shadow: 0 4px 16px rgba(0,0,0,0.16); }
        .cora-image-floating-actions button { padding: 2px 8px; font-size: 11px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); background: var(--vscode-editorWidget-background, #fff); color: var(--vscode-foreground, #333); cursor: pointer; }
        .cora-image-floating-actions button:hover { background: var(--vscode-toolbar-hoverBackground, #e5e7eb); }
        .cora-image-floating-actions button:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

        /* 强力隐藏 */
        .mermaid-src-hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="top-bar">
        <button type="button" id="cora-copy-preview-btn" class="copy-preview-btn" data-copied="${copiedToClipboardLabel}" aria-label="${copyPreviewLabel}">${copyPreviewLabel}</button>
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
    <script nonce="${nonce}">${this.getTableLayoutScript()}</script>
    <script type="module" nonce="${nonce}" src="${editorJsUri}"></script>
</body>
</html>`;
    }

    private getTableLayoutScript(): string {
        return `
(function() {
    var SHORT = 16;
    function dw(t) { var n=0; for(var i=0;i<t.length;i++) n += t.charCodeAt(i)>0x7f?2:1; return n; }

    function optimizeTable(table) {
        var rows = table.querySelectorAll('tr');
        if (!rows.length) return;
        var cc = rows[0].querySelectorAll('th,td').length;
        if (cc < 2) return;

        var mw = [];
        for (var c = 0; c < cc; c++) {
            var mx = 0;
            rows.forEach(function(r) {
                var cell = r.querySelectorAll('th,td')[c];
                if (cell) { var v = dw((cell.textContent||'').trim()); if(v>mx) mx=v; }
            });
            mw.push(mx);
        }

        var hasLong = mw.some(function(v) { return v > SHORT; });
        if (!hasLong) return;

        rows.forEach(function(r) {
            var cells = r.querySelectorAll('th,td');
            for (var c = 0; c < cc && c < cells.length; c++) {
                if (mw[c] <= SHORT) {
                    cells[c].style.setProperty('white-space','nowrap','important');
                }
            }
        });
    }

    var OBS_OPTS = { childList: true, subtree: true };

    function optimizeAll(container) {
        if (!container) return;
        try {
            var obs = container._coraTableObs;
            if (obs) obs.disconnect();
            var tables = container.querySelectorAll('table');
            tables.forEach(function(t) { optimizeTable(t); });
            if (obs) obs.observe(container, OBS_OPTS);
        } catch(e) { console.error('[Cora] table optimize error:', e); }
    }

    var _timer = null;
    function scheduleOptimize(container) {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(function() { _timer = null; optimizeAll(container); }, 150);
    }

    window.__coraOptimizeTableLayout = function(container) {
        optimizeAll(container);

        if (container && !container._coraTableObs) {
            var obs = new MutationObserver(function() { scheduleOptimize(container); });
            obs.observe(container, OBS_OPTS);
            container._coraTableObs = obs;
        }
    };
})();`;
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
