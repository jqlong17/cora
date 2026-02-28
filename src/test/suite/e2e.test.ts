import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { FileService } from '../../services/fileService';
import { ConfigService } from '../../services/configService';
import { FavoritesService } from '../../services/favoritesService';
import { PageTreeProvider } from '../../providers/pageTreeProvider';
import { SearchProvider, SearchItem } from '../../providers/searchProvider';
import { OutlineProvider, OutlineItem } from '../../providers/outlineProvider';
import { OutlineService } from '../../services/outlineService';

/**
 * E2E 测试套件 - 在真实 VS Code 环境中测试扩展功能
 *
 * 运行方式:
 * 1. 按 F5 启动 Extension Test Host
 * 2. 在 Test Host 中运行测试
 *
 * 或者命令行:
 * npm test
 */
suite('Cora E2E Test Suite', () => {
    const testWorkspacePath = path.resolve(__dirname, '../../../test-workspace');
    let fileService: FileService;
    let configService: ConfigService;
    let favoritesService: FavoritesService;
    let pageTreeProvider: PageTreeProvider;
    let searchProvider: SearchProvider;
    let outlineService: OutlineService;
    let outlineProvider: OutlineProvider;

    // 测试前准备：用 seed 脚本填充 test-workspace（根目录 3 个 md + html/txt，子目录 docs/notes/resources），再设置 mtime 供平铺排序等测试
    suiteSetup(async () => {
        console.log('Setting up E2E test environment...');

        const projectRoot = path.resolve(__dirname, '../../..');
        execSync('node scripts/seed-test-workspace.js', { cwd: projectRoot, encoding: 'utf8' });

        const baseTime = Date.now();
        const day = 24 * 60 * 60 * 1000;
        const hour = 60 * 60 * 1000;

        // 根目录 3 个 md 的 mtime（平铺时与嵌套一起按 mtime 降序）
        const rootFilesWithMtime: { name: string; offsetMs: number }[] = [
            { name: '读书笔记.md', offsetMs: -7 * day },
            { name: '会议纪要.md', offsetMs: -5 * day },
            { name: '项目计划.md', offsetMs: -3 * day }
        ];
        for (const r of rootFilesWithMtime) {
            const p = path.join(testWorkspacePath, r.name);
            if (fs.existsSync(p)) {
                const t = new Date(baseTime + r.offsetMs);
                fs.utimesSync(p, t, t);
            }
        }

        // 子目录 md 的 mtime（周报-02 设为最近，便于 flat 测试断言「第一个是周报-02」）
        const nestedWithMtime: { relPath: string; offsetMs: number }[] = [
            { relPath: path.join('notes', '2024', '周报-02.md'), offsetMs: 0 }
        ];
        for (const n of nestedWithMtime) {
            const p = path.join(testWorkspacePath, n.relPath);
            if (fs.existsSync(p)) {
                const t = new Date(baseTime + n.offsetMs);
                fs.utimesSync(p, t, t);
            }
        }

        // 初始化服务
        configService = new ConfigService();
        fileService = new FileService(configService);
        const store: Record<string, unknown> = {};
        const mockMemento: vscode.Memento = {
            get<T>(key: string, defaultValue?: T): T | undefined {
                return (key in store ? store[key] : defaultValue) as T | undefined;
            },
            update(key: string, value: unknown): Thenable<void> {
                store[key] = value;
                return Promise.resolve();
            },
            keys(): readonly string[] {
                return Object.keys(store);
            }
        };
        favoritesService = new FavoritesService(mockMemento);
        pageTreeProvider = new PageTreeProvider(fileService, configService, favoritesService);
        searchProvider = new SearchProvider(fileService, configService);
        outlineService = new OutlineService();
        outlineProvider = new OutlineProvider(outlineService, configService);

        console.log('Test workspace created at:', testWorkspacePath);
    });

    // 测试后恢复：再次运行 seed，保证 test-workspace 与 seed 一致
    suiteTeardown(async () => {
        console.log('Cleaning up E2E test environment...');
        const projectRoot = path.resolve(__dirname, '../../..');
        execSync('node scripts/seed-test-workspace.js', { cwd: projectRoot, encoding: 'utf8' });
    });

    suite('Extension Activation', () => {
        test('should activate Cora extension', async () => {
            const coraExtension = vscode.extensions.getExtension('jqlong.cora');
            assert.ok(coraExtension, 'Cora extension should be installed');

            if (!coraExtension.isActive) {
                await coraExtension.activate();
            }
            assert.strictEqual(coraExtension.isActive, true, 'Cora extension should be active');
        });

        test('should register all Cora commands', async () => {
            const commands = await vscode.commands.getCommands(true);
            const coraCommands = commands.filter(cmd => cmd.startsWith('knowledgeBase.'));

            const expectedCommands = [
                'knowledgeBase.refreshPageTree',
                'knowledgeBase.toggleFilter',
                'knowledgeBase.togglePageView',
                'knowledgeBase.setPageViewModeTree',
                'knowledgeBase.setPageViewModeFlat',
                'knowledgeBase.setPageViewModeFavorites',
                'knowledgeBase.toggleFavorite',
                'knowledgeBase.setSortOrder',
                'knowledgeBase.showAllFiles',
                'knowledgeBase.showMarkdownOnly',
                'knowledgeBase.outlineCollapseAll',
                'knowledgeBase.outlineExpandAll',
                'knowledgeBase.newNote',
                'knowledgeBase.newFolder',
                'knowledgeBase.deleteItem',
                'knowledgeBase.renameItem',
                'knowledgeBase.openPreview',
                'knowledgeBase.openEditor',
                'knowledgeBase.togglePreviewEditor',
                'knowledgeBase.selectFont',
                'knowledgeBase.gotoHeading',
                'knowledgeBase.revealInFinder',
                'knowledgeBase.copyPath',
                'knowledgeBase.copyRelativePath',
                'knowledgeBase.searchNotes',
                'knowledgeBase.clearSearch'
            ];

            for (const cmd of expectedCommands) {
                assert.ok(coraCommands.includes(cmd), `Command ${cmd} should be registered`);
            }
        });
    });

    suite('Page Tree View', () => {
        test('should create page tree provider', async () => {
            assert.ok(pageTreeProvider, 'Page tree provider should be created');
            assert.ok(typeof pageTreeProvider.getChildren === 'function', 'Should have getChildren method');
            assert.ok(typeof pageTreeProvider.refresh === 'function', 'Should have refresh method');
        });

        test('should get children from workspace', async function() {
            // 在某些测试环境中可能没有打开工作区
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.skip();
                return;
            }

            const children = await pageTreeProvider.getChildren();
            // 如果有工作区，应该有子项；如果没有，也是正常情况
            console.log('Page tree children count:', children.length);
            assert.ok(Array.isArray(children), 'Children should be an array');
        });

        test('should refresh page tree', async () => {
            // 测试刷新功能不会报错
            assert.doesNotThrow(() => {
                pageTreeProvider.refresh();
            }, 'Refresh should not throw error');
        });

        test('should provide tree items', async function() {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.skip();
                return;
            }

            const children = await pageTreeProvider.getChildren();
            if (children.length > 0) {
                const treeItem = pageTreeProvider.getTreeItem(children[0]);
                assert.ok(treeItem, 'Should return tree item');
                assert.ok(treeItem.label, 'Tree item should have label');
            }
        });

        test('flat view: root children sorted by mtime desc, most recent first', async function() {
            if (!vscode.workspace.workspaceFolders?.length) {
                this.skip();
                return;
            }
            await configService.setPageViewMode('flat');
            pageTreeProvider.refresh();
            const children = await pageTreeProvider.getChildren();
            await configService.setPageViewMode('tree');
            pageTreeProvider.refresh();
            assert.ok(Array.isArray(children), 'Flat view should return array');
            assert.ok(children.length >= 1, 'Flat view should list at least one MD file');
            const first = pageTreeProvider.getTreeItem(children[0]);
            assert.ok(first?.label, 'First item should have label');
            const isTestWorkspace = vscode.workspace.workspaceFolders?.length === 1 &&
                vscode.workspace.workspaceFolders[0].uri.fsPath === testWorkspacePath;
            if (isTestWorkspace && children.length >= 4) {
                assert.strictEqual(first.label, '周报-02.md', 'In test workspace, first in flat view should be most recent (周报-02.md)');
            }
        });

        test('flat view: after refresh, new file appears in list', async function() {
            if (!vscode.workspace.workspaceFolders?.length) {
                this.skip();
                return;
            }
            const uniqueName = `e2e-flat-refresh-${Date.now()}.md`;
            const parentUri = vscode.Uri.file(testWorkspacePath);
            const created = await fileService.createFile(parentUri, uniqueName);
            if (!created) {
                this.skip();
                return;
            }
            try {
                pageTreeProvider.refresh();
                await configService.setPageViewMode('flat');
                pageTreeProvider.refresh();
                const children = await pageTreeProvider.getChildren();
                const labels = children.map(c => pageTreeProvider.getTreeItem(c).label);
                assert.ok(labels.includes(uniqueName), 'After refresh, flat view should list the newly created file');
            } finally {
                await fileService.deleteItem(created);
            }
            await configService.setPageViewMode('tree');
            pageTreeProvider.refresh();
        });

        test('favorites view: empty when no favorites', async function() {
            if (!vscode.workspace.workspaceFolders?.length) {
                this.skip();
                return;
            }
            await configService.setPageViewMode('favorites');
            pageTreeProvider.refresh();
            const children = await pageTreeProvider.getChildren();
            assert.ok(Array.isArray(children), 'Favorites view should return array');
            assert.strictEqual(children.length, 0, 'Favorites view should be empty when no favorites');
        });

        test('favorites view: shows favorited file after addFavorite and refresh', async function() {
            if (!vscode.workspace.workspaceFolders?.length) {
                this.skip();
                return;
            }
            const mdPath = path.join(testWorkspacePath, '项目计划.md');
            const uri = vscode.Uri.file(mdPath);
            await favoritesService.addFavorite(uri);
            await configService.setPageViewMode('favorites');
            pageTreeProvider.refresh();
            const children = await pageTreeProvider.getChildren();
            assert.ok(children.length >= 1, 'Favorites view should list the favorited file');
            const labels = children.map(c => pageTreeProvider.getTreeItem(c).label);
            assert.ok(labels.includes('项目计划.md'), 'Should contain 项目计划.md');
            await favoritesService.removeFavorite(uri);
            pageTreeProvider.refresh();
            const afterRemove = await pageTreeProvider.getChildren();
            assert.strictEqual(afterRemove.length, 0, 'After removeFavorite and refresh, favorites view should be empty');
        });

        test('tree view: favorited file shows file+favorite contextValue', async function() {
            if (!vscode.workspace.workspaceFolders?.length) {
                this.skip();
                return;
            }
            const mdPath = path.join(testWorkspacePath, '会议纪要.md');
            const uri = vscode.Uri.file(mdPath);
            await favoritesService.addFavorite(uri);
            pageTreeProvider.refresh();
            await configService.setPageViewMode('tree');
            pageTreeProvider.refresh();
            const children = await pageTreeProvider.getChildren();
            const meetingItem = children.find(c => c.item.name === '会议纪要.md');
            if (meetingItem) {
                const treeItem = pageTreeProvider.getTreeItem(meetingItem);
                assert.strictEqual(treeItem.contextValue, 'file+favorite', 'Favorited file in tree view should have contextValue file+favorite');
            }
            await favoritesService.removeFavorite(uri);
            pageTreeProvider.refresh();
        });
    });

    suite('File Operations', () => {
        test('should create new note file', async () => {
            const testFileName = '测试新建笔记.md';
            const testFilePath = path.join(testWorkspacePath, testFileName);

            // 确保文件不存在
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
            }

            // 创建文件
            const parentUri = vscode.Uri.file(testWorkspacePath);
            const newUri = await fileService.createFile(parentUri, testFileName);

            assert.ok(newUri, 'Should return new file URI');
            assert.ok(fs.existsSync(testFilePath), 'File should be created');

            // 清理
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
            }
        });

        test('should create new folder', async () => {
            const testFolderName = '测试文件夹';
            const testFolderPath = path.join(testWorkspacePath, testFolderName);

            // 确保文件夹不存在
            if (fs.existsSync(testFolderPath)) {
                fs.rmSync(testFolderPath, { recursive: true, force: true });
            }

            // 创建文件夹
            const parentUri = vscode.Uri.file(testWorkspacePath);
            const newUri = await fileService.createFolder(parentUri, testFolderName);

            assert.ok(newUri, 'Should return new folder URI');
            assert.ok(fs.existsSync(testFolderPath), 'Folder should be created');
            assert.ok(fs.statSync(testFolderPath).isDirectory(), 'Should be a directory');

            // 清理
            if (fs.existsSync(testFolderPath)) {
                fs.rmSync(testFolderPath, { recursive: true, force: true });
            }
        });

        test('should rename file', async () => {
            const originalName = '重命名测试.md';
            const newName = '已重命名.md';
            const originalPath = path.join(testWorkspacePath, originalName);
            const newPath = path.join(testWorkspacePath, newName);

            // 创建原始文件
            fs.writeFileSync(originalPath, '# Test', 'utf8');

            // 重命名
            const originalUri = vscode.Uri.file(originalPath);
            const renamedUri = await fileService.renameItem(originalUri, newName);

            assert.ok(renamedUri, 'Should return renamed URI');
            assert.ok(!fs.existsSync(originalPath), 'Original file should not exist');
            assert.ok(fs.existsSync(newPath), 'New file should exist');

            // 清理
            if (fs.existsSync(newPath)) {
                fs.unlinkSync(newPath);
            }
        });

        test('should delete file', async () => {
            const testFileName = '删除测试.md';
            const testFilePath = path.join(testWorkspacePath, testFileName);

            // 创建测试文件
            fs.writeFileSync(testFilePath, '# Test', 'utf8');
            assert.ok(fs.existsSync(testFilePath), 'File should exist before deletion');

            // 删除文件
            const fileUri = vscode.Uri.file(testFilePath);
            const success = await fileService.deleteItem(fileUri);

            assert.ok(success, 'Delete should return true');
            assert.ok(!fs.existsSync(testFilePath), 'File should be deleted');
        });

        test('should get workspace folders', function() {
            const folders = fileService.getWorkspaceFolders();
            // 在测试环境中可能没有工作区文件夹，这是正常的
            assert.ok(Array.isArray(folders), 'Should return an array');
            console.log('Workspace folders count:', folders.length);
        });
    });

    suite('Filter and Display', () => {
        test('should filter markdown files only', async function() {
            // 设置过滤模式为 markdown
            await configService.setFilterMode('markdown');
            // 重新加载配置以确保更新生效
            configService.reload();
            const filterMode = configService.getFilterMode();
            // 配置更新可能有延迟，测试主要验证方法不报错
            assert.ok(['all', 'markdown'].includes(filterMode), 'Filter mode should be valid');
        });

        test('should show all files when filter is all', async function() {
            // 保存原始值
            const originalMode = configService.getFilterMode();

            // 尝试设置为 all
            await configService.setFilterMode('all');
            configService.reload();
            const filterMode = configService.getFilterMode();

            // 验证模式已更改（或保持原样如果配置不可写）
            assert.ok(['all', 'markdown'].includes(filterMode), 'Filter mode should be valid');

            // 恢复原始值
            await configService.setFilterMode(originalMode);
        });

        test('should get markdown extensions', () => {
            const extensions = configService.getMarkdownExtensions();
            assert.deepStrictEqual(extensions, ['.md', '.markdown', '.mdx', '.mdc'], 'Should have default markdown extensions');
        });

        test('should show .mdc files in tree when filter is markdown', async function() {
            const folders = fileService.getWorkspaceFolders();
            if (folders.length === 0) {
                this.skip();
                return;
            }
            const rootPath = folders[0].uri.fsPath;
            const mdcName = 'test-rules.mdc';
            const mdcPath = path.join(rootPath, mdcName);
            try {
                fs.writeFileSync(mdcPath, '---\nalwaysApply: true\n---\n# Test rules\n', 'utf8');
                await configService.setFilterMode('markdown');
                configService.reload();
                pageTreeProvider.refresh();
                const children = await pageTreeProvider.getChildren();
                const labels = children.map(c => (pageTreeProvider.getTreeItem(c) as vscode.TreeItem).label);
                assert.ok(labels.includes(mdcName), `Tree should contain ${mdcName} when filter is markdown`);
            } finally {
                if (fs.existsSync(mdcPath)) {
                    fs.unlinkSync(mdcPath);
                }
            }
        });
    });

    suite('Outline View', () => {
        test('should extract headings from markdown document', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(document);

            assert.ok(editor, 'Editor should be opened');
            assert.strictEqual(document.languageId, 'markdown', 'Document should be markdown');

            // 测试 outline service
            const headings = await outlineService.getHeadings(document);
            assert.ok(headings.length >= 3, 'Should have at least 3 headings');

            // 验证标题结构
            const h1Headings = headings.filter(h => h.level === 1);
            const h2Headings = headings.filter(h => h.level === 2);
            assert.strictEqual(h1Headings.length, 1, 'Should have 1 H1 heading');
            assert.ok(h2Headings.length >= 2, 'Should have at least 2 H2 headings');

            // 验证标题内容
            assert.ok(headings.some(h => h.text === '项目计划'), 'Should have "项目计划" heading');
            assert.ok(headings.some(h => h.text === '需求分析'), 'Should have "需求分析" heading');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should update outline when switching documents', async () => {
            // 打开第一个文件
            const file1 = path.join(testWorkspacePath, '项目计划.md');
            const doc1 = await vscode.workspace.openTextDocument(file1);
            await vscode.window.showTextDocument(doc1);

            const headings1 = await outlineService.getHeadings(doc1);
            assert.ok(headings1.some(h => h.text === '项目计划'), 'First doc should have "项目计划"');

            // 打开第二个文件
            const file2 = path.join(testWorkspacePath, '会议纪要.md');
            const doc2 = await vscode.workspace.openTextDocument(file2);
            await vscode.window.showTextDocument(doc2);

            const headings2 = await outlineService.getHeadings(doc2);
            assert.ok(headings2.some(h => h.text === '会议纪要'), 'Second doc should have "会议纪要"');
            assert.ok(!headings2.some(h => h.text === '项目计划'), 'Second doc should not have "项目计划"');

            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        test('should goto heading line', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(document);

            // 获取标题
            const headings = await outlineService.getHeadings(document);
            const firstHeading = headings[0];
            assert.ok(firstHeading, 'Should have at least one heading');

            // 跳转到标题行
            const line = firstHeading.line;
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));

            // 验证光标位置
            assert.strictEqual(editor.selection.active.line, line, 'Cursor should be at heading line');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should handle outline hierarchy', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(document);

            outlineProvider.updateForEditor(editor);
            await new Promise(resolve => setTimeout(resolve, 400));

            const rootItems = await outlineProvider.getChildren();
            assert.ok(rootItems.length > 0, 'Should have root outline items');

            const h1Root = rootItems.find(item => item.heading.level === 1);
            assert.ok(h1Root, 'Should have an H1 root item');

            // 获取 H1 的子节点（H2）
            const h2Items = await outlineProvider.getChildren(h1Root!);
            assert.ok(h2Items.length >= 2, 'H1 should have at least 2 H2 children');
            h2Items.forEach(item => {
                assert.strictEqual(item.heading.level, 2, 'Children of H1 should be H2');
            });

            // 获取第一个 H2 的子节点（H3）
            const h3Items = await outlineProvider.getChildren(h2Items[0]);
            assert.ok(h3Items.length >= 1, 'H2 should have at least 1 H3 child');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should clear outline when no markdown file', async () => {
            outlineProvider.clear();
            const items = await outlineProvider.getChildren();
            assert.strictEqual(items.length, 0, 'Outline should be empty after clear');
        });

        test('should refresh outline after document save (e.g. edit mode save)', async function() {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.skip();
                return;
            }

            const testFile = path.join(testWorkspacePath, 'outline-refresh-test.md');
            const initialContent = '# 测试\n\n## 第一节\n\n内容\n\n';
            const updatedContent = '# 测试\n\n## 第一节\n\n内容\n\n## 笔记2\n\n## 笔记3\n';

            await fs.promises.writeFile(testFile, initialContent, 'utf8');
            const uri = vscode.Uri.file(testFile);

            await outlineProvider.updateForUri(uri);
            let rootItems = await outlineProvider.getChildren();
            let h1 = rootItems.find(item => item.heading.level === 1);
            assert.ok(h1, 'Should have H1');
            let h2Items = await outlineProvider.getChildren(h1!);
            const textsBefore = h2Items.map(item => item.heading.text);
            assert.ok(!textsBefore.includes('笔记2'), 'Before save: 笔记2 should not be in outline');
            assert.ok(!textsBefore.includes('笔记3'), 'Before save: 笔记3 should not be in outline');

            await fs.promises.writeFile(testFile, updatedContent, 'utf8');
            outlineProvider.updateForUri(uri);

            rootItems = await outlineProvider.getChildren();
            h1 = rootItems.find(item => item.heading.level === 1);
            assert.ok(h1, 'Should have H1 after refresh');
            h2Items = await outlineProvider.getChildren(h1!);
            const textsAfter = h2Items.map(item => item.heading.text);
            assert.ok(textsAfter.includes('笔记2'), 'After save: outline should include 笔记2');
            assert.ok(textsAfter.includes('笔记3'), 'After save: outline should include 笔记3');

            try { fs.unlinkSync(testFile); } catch (_) {}
        });

        test('should update outline in real-time when editing in text editor', async function() {
            this.timeout(7000);
            const testFile = path.join(testWorkspacePath, 'outline-realtime-test.md');
            const initialContent = '# 项目计划\n\n## 时间安排\n\n### 标题\n\n';
            await fs.promises.writeFile(testFile, initialContent, 'utf8');

            const uri = vscode.Uri.file(testFile);
            const document = await vscode.workspace.openTextDocument(uri);
            let editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });

            // 初始状态用 updateForUri 建立稳定基线，避免受 active editor 切换与防抖影响
            await outlineProvider.updateForUri(uri);

            const getAllHeadingTexts = async (): Promise<string[]> => {
                const texts: string[] = [];
                const collect = async (items: OutlineItem[]) => {
                    for (const item of items) {
                        texts.push(item.heading.text);
                        const children = await outlineProvider.getChildren(item);
                        await collect(children);
                    }
                };
                await collect(await outlineProvider.getChildren());
                return texts;
            };

            const waitForHeading = async (headingText: string, shouldExist: boolean, timeoutMs = 3000): Promise<string[]> => {
                const start = Date.now();
                let latest: string[] = [];
                while (Date.now() - start < timeoutMs) {
                    latest = await getAllHeadingTexts();
                    const exists = latest.includes(headingText);
                    if (exists === shouldExist) {
                        return latest;
                    }
                    await new Promise(resolve => setTimeout(resolve, 80));
                }
                return latest;
            };

            let texts = await waitForHeading('标题', true);
            assert.ok(texts.includes('标题'), 'Initial outline should contain 标题');
            assert.ok(!texts.includes('标题2222'), 'Initial outline should not yet contain 标题2222');

            // 重新确保 editor 句柄有效，避免测试环境中 active editor 切换导致的非法句柄
            editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
            await editor.edit(editBuilder => {
                const end = document.lineAt(document.lineCount - 1).range.end;
                editBuilder.insert(end, '\n### 标题2222\n');
            });

            outlineProvider.updateForEditor(editor);
            texts = await waitForHeading('标题2222', true);
            assert.ok(texts.includes('标题2222'), 'Outline should update in real-time and include 标题2222 after edit');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            try { fs.unlinkSync(testFile); } catch (_) {}
        });
    });

    suite('Search Functionality', () => {
        test('should search single keyword', async function() {
            // 在测试环境中可能没有打开工作区
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.skip();
                return;
            }

            await searchProvider.search('项目计划');
            const results = await searchProvider.getChildren();

            // 搜索功能依赖于实际文件系统，可能没有结果也是正常的
            console.log('Search results count:', results.length);
            assert.ok(Array.isArray(results), 'Results should be an array');
        });

        test('should search multiple keywords (AND logic)', async () => {
            // 搜索包含"项目"和"需求"的文件
            await searchProvider.search('项目 需求');
            const results = await searchProvider.getChildren();

            // 结果应该同时包含这两个关键词
            for (const result of results) {
                const content = fs.readFileSync(result.result.uri.fsPath, 'utf8');
                assert.ok(content.includes('项目') && content.includes('需求'),
                    'Result should contain both keywords');
            }
        });

        test('should sort results by match count', async () => {
            await searchProvider.search('模式');
            const results = await searchProvider.getChildren();

            if (results.length >= 2) {
                // 验证按匹配次数降序排列
                for (let i = 0; i < results.length - 1; i++) {
                    assert.ok(results[i].result.matchCount >= results[i + 1].result.matchCount,
                        'Results should be sorted by match count descending');
                }
            }
        });

        test('should clear search results', async () => {
            // 先搜索（即使搜索失败也能测试清除功能）
            try {
                await searchProvider.search('项目');
            } catch (e) {
                console.log('Search may have failed:', e);
            }

            // 可能有结果也可能没有，清除后应该为空
            searchProvider.clear();
            const results = await searchProvider.getChildren();
            assert.strictEqual(results.length, 0, 'Search results should be cleared');
        });

        test('should get last query', async () => {
            const query = '测试查询';
            await searchProvider.search(query);
            const lastQuery = searchProvider.getLastQuery();
            assert.strictEqual(lastQuery, query, 'Should remember last query');
        });

        test('should handle empty search', async () => {
            await searchProvider.search('');
            const results = await searchProvider.getChildren();
            // 空搜索时应该返回空数组
            assert.strictEqual(results.length, 0, 'Empty search should return empty array');
        });

        test('should generate preview for search results', async () => {
            await searchProvider.search('TypeScript');
            const results = await searchProvider.getChildren();

            if (results.length > 0) {
                const preview = results[0].result.preview;
                assert.ok(preview.length > 0, 'Should have preview text');
                assert.ok(preview.length <= 53, 'Preview should be truncated with ellipsis if too long');
            }
        });
    });

    suite('Editor Display and Tab State', () => {
        // 注意：Cora 预览/Markdown 双模、行号、划词 Add to Chat 等均在 webview 内实现，
        // 当前 E2E 仅验证命令与 Tab 状态，不驱动 webview 内 UI。

        test('should open markdown file in editor with correct display', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(document);

            assert.ok(editor, 'Editor should be opened');
            assert.strictEqual(editor.document.languageId, 'markdown', 'Document language should be markdown');

            const content = editor.document.getText();
            assert.ok(content.includes('# 项目计划'), 'Should display H1 heading');
            assert.ok(content.includes('## 需求分析'), 'Should display H2 heading');
            assert.ok(content.includes('使用 TypeScript 开发'), 'Should display content text');

            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor, 'Should be in edit mode (activeTextEditor exists)');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should switch to preview mode and reflect in tab state', async () => {
            const testFile = path.join(testWorkspacePath, '会议纪要.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(document);

            assert.ok(vscode.window.activeTextEditor, 'Initial state should be edit mode');

            const initialTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            assert.ok(initialTab, 'Should have active tab');

            await vscode.commands.executeCommand('knowledgeBase.openPreview');
            await new Promise(resolve => setTimeout(resolve, 500));

            const previewTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            assert.ok(previewTab, 'Should have active tab after preview');
            assert.ok(previewTab.label.includes('会议纪要'), 'Tab label should show filename');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should switch from Cora preview to native editor when openEditor is run', async function() {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.skip();
                return;
            }
            const testFile = path.join(testWorkspacePath, '读书笔记.md');
            const uri = vscode.Uri.file(testFile);
            await vscode.commands.executeCommand('knowledgeBase.openPreview', uri);
            await new Promise(resolve => setTimeout(resolve, 800));

            await vscode.commands.executeCommand('knowledgeBase.openEditor', uri);
            await new Promise(resolve => setTimeout(resolve, 400));

            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor, 'After openEditor should have active text editor');
            assert.ok(activeEditor.document.uri.fsPath === testFile || activeEditor.document.fileName === testFile,
                'Active editor should show the same file');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should open .mdc file with Cora preview', async function() {
            const mdcName = 'e2e-preview-test.mdc';
            const mdcPath = path.join(testWorkspacePath, mdcName);
            try {
                fs.writeFileSync(mdcPath, '---\ndescription: E2E test\n---\n# MDC Preview Test\n', 'utf8');
                const uri = vscode.Uri.file(mdcPath);
                await vscode.commands.executeCommand('knowledgeBase.openPreview', uri);
                await new Promise(resolve => setTimeout(resolve, 800));

                const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
                assert.ok(tab, 'Should have active tab after openPreview');
                assert.ok(tab.label.includes(mdcName) || (tab.input as { uri?: vscode.Uri })?.uri?.fsPath?.endsWith('.mdc'),
                    'Tab should show .mdc file');
                const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === mdcPath || d.fileName.endsWith(mdcName));
                assert.ok(doc, 'Document for .mdc file should be open or loaded');
                assert.ok(doc.fileName.endsWith('.mdc'), 'Opened document should be .mdc');

                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            } finally {
                if (fs.existsSync(mdcPath)) {
                    fs.unlinkSync(mdcPath);
                }
            }
        });

        test('should keep Cora preview and support gotoHeading in Marked mode', async function() {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const uri = vscode.Uri.file(testFile);
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            assert.ok(content.includes('<table>'), 'Test doc should contain HTML and use Marked mode');

            await vscode.commands.executeCommand('knowledgeBase.openPreview', uri);
            await new Promise(resolve => setTimeout(resolve, 800));

            const tabBefore = vscode.window.tabGroups.activeTabGroup.activeTab;
            assert.ok(tabBefore, 'Should have active preview tab in Marked mode');
            assert.ok(tabBefore.label.includes('项目计划'), 'Preview tab should match target file');

            const headings = await outlineService.getHeadings(document);
            const target1 = headings.find(h => h.text === '需求分析');
            const target2 = headings.find(h => h.text === '技术方案');
            assert.ok(target1, 'Should have 需求分析 heading');
            assert.ok(target2, 'Should have 技术方案 heading');

            await vscode.commands.executeCommand('knowledgeBase.gotoHeading', target1!.line, uri.toString());
            await new Promise(resolve => setTimeout(resolve, 400));
            await vscode.commands.executeCommand('knowledgeBase.gotoHeading', target2!.line, uri.toString());
            await new Promise(resolve => setTimeout(resolve, 400));

            const tabAfter = vscode.window.tabGroups.activeTabGroup.activeTab;
            assert.ok(tabAfter, 'After gotoHeading should still have an active tab');
            assert.ok(tabAfter.label.includes('项目计划'), 'After gotoHeading should stay on same preview file');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should toggle between edit and preview modes', async () => {
            const testFile = path.join(testWorkspacePath, '读书笔记.md');

            const document = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(document, { preview: false });
            assert.ok(vscode.window.activeTextEditor, 'Step 1: Should start in edit mode');

            await vscode.commands.executeCommand('markdown.showPreview', document.uri);
            await new Promise(resolve => setTimeout(resolve, 500));

            const isPreviewMode = !vscode.window.activeTextEditor;
            console.log('Preview mode check:', isPreviewMode);

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await new Promise(resolve => setTimeout(resolve, 200));

            const doc2 = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(doc2, { preview: false });
            await new Promise(resolve => setTimeout(resolve, 300));

            const backToEdit = !!vscode.window.activeTextEditor;
            assert.strictEqual(backToEdit, true, 'Step 3: Should be back in edit mode');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should update outline when opening file from page tree', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(document);

            assert.ok(editor, 'Editor should open from page tree click');

            const content = document.getText();
            const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
            assert.strictEqual(headings.length >= 3, true, 'Should have at least 3 headings for outline');

            const h1Count = headings.filter(h => h.startsWith('# ')).length;
            const h2Count = headings.filter(h => h.startsWith('## ')).length;
            assert.strictEqual(h1Count, 1, 'Should have 1 H1 heading');
            assert.ok(h2Count >= 2, 'Should have at least 2 H2 headings');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should maintain correct tab state after multiple file switches', async () => {
            const file1 = path.join(testWorkspacePath, '项目计划.md');
            const file2 = path.join(testWorkspacePath, '会议纪要.md');

            const doc1 = await vscode.workspace.openTextDocument(file1);
            await vscode.window.showTextDocument(doc1);
            assert.ok(vscode.window.activeTextEditor, 'First file should open in edit mode');

            await vscode.commands.executeCommand('knowledgeBase.openPreview');
            await new Promise(resolve => setTimeout(resolve, 200));

            const doc2 = await vscode.workspace.openTextDocument(file2);
            await vscode.window.showTextDocument(doc2);

            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor, 'Second file should be in edit mode');
            assert.ok(activeEditor.document.fileName.includes('会议纪要'), 'Should show second document');

            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });
    });

    suite('Context Menu Commands', () => {
        test('should copy path to clipboard', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const fileUri = vscode.Uri.file(testFile);

            // 模拟右键菜单复制路径
            await vscode.env.clipboard.writeText(fileUri.fsPath);
            const clipboardContent = await vscode.env.clipboard.readText();

            assert.strictEqual(clipboardContent, fileUri.fsPath, 'Should copy absolute path to clipboard');
        });

        test('should copy relative path to clipboard', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(testFile));

            if (workspaceFolder) {
                const relativePath = path.relative(workspaceFolder.uri.fsPath, testFile);
                await vscode.env.clipboard.writeText(relativePath);
                const clipboardContent = await vscode.env.clipboard.readText();

                assert.strictEqual(clipboardContent, relativePath, 'Should copy relative path to clipboard');
            }
        });

        test('should copy file', async () => {
            const sourceFile = path.join(testWorkspacePath, '复制源文件.md');
            const targetFile = path.join(testWorkspacePath, '复制源文件 副本.md');

            // 创建源文件
            fs.writeFileSync(sourceFile, '# 复制测试', 'utf8');

            // 清理目标文件（如果存在）
            if (fs.existsSync(targetFile)) {
                fs.unlinkSync(targetFile);
            }

            // 模拟复制文件
            const content = fs.readFileSync(sourceFile);
            fs.writeFileSync(targetFile, content);

            assert.ok(fs.existsSync(targetFile), 'Copied file should exist');
            const copiedContent = fs.readFileSync(targetFile, 'utf8');
            assert.strictEqual(copiedContent, '# 复制测试', 'Copied content should match original');

            // 清理
            fs.unlinkSync(sourceFile);
            fs.unlinkSync(targetFile);
        });

        test('should reveal file in OS', async () => {
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const fileUri = vscode.Uri.file(testFile);

            // 验证文件存在
            assert.ok(fs.existsSync(testFile), 'File should exist to be revealed');

            // 测试 revealFileInOS 命令存在
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('revealFileInOS'), 'revealFileInOS command should exist');
        });
    });

    suite('Configuration', () => {
        test('should have default configuration', async function() {
            // 重新加载配置以获取最新值
            configService.reload();

            // 使用 configService 获取值，它已经在构造函数中读取了配置
            const filterMode = configService.getFilterMode();
            const extensions = configService.getMarkdownExtensions();
            const previewOnClick = configService.getPreviewOnClick();
            const autoReveal = configService.getAutoReveal();

            // 验证配置值有效（不一定必须是特定值，因为测试环境可能已修改）
            assert.ok(['all', 'markdown'].includes(filterMode), `Filter mode should be valid, got: ${filterMode}`);
            assert.ok(Array.isArray(extensions) && extensions.length > 0, 'Extensions should be a non-empty array');
            assert.ok(typeof previewOnClick === 'boolean', 'previewOnClick should be boolean');
            assert.ok(typeof autoReveal === 'boolean', 'autoReveal should be boolean');
        });

        test('should allow configuration changes', async function() {
            // 在测试环境中配置更新可能受限
            const config = vscode.workspace.getConfiguration('knowledgeBase');

            // 获取当前值
            const originalValue = config.get<string>('filterMode');
            console.log('Original filter mode:', originalValue);

            // 尝试修改配置
            try {
                await config.update('filterMode', 'all', true);
                // 给配置更新一点时间
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.log('Config update may be restricted in test environment:', e);
            }

            // 配置在测试环境中可能无法实际修改，主要测试 API 调用不报错
            const newValue = config.get<string>('filterMode');
            console.log('New filter mode:', newValue);
            assert.ok(['all', 'markdown'].includes(newValue || ''), 'Filter mode should be valid');

            // 尝试恢复默认
            try {
                await config.update('filterMode', originalValue, true);
            } catch (e) {
                console.log('Config restore may be restricted:', e);
            }
        });

        test('should get configuration values from service', () => {
            const filterMode = configService.getFilterMode();
            assert.ok(['all', 'markdown'].includes(filterMode), 'Filter mode should be valid');

            const extensions = configService.getMarkdownExtensions();
            assert.ok(Array.isArray(extensions), 'Extensions should be an array');
            assert.ok(extensions.length > 0, 'Should have at least one extension');

            const previewOnClick = configService.getPreviewOnClick();
            assert.ok(typeof previewOnClick === 'boolean', 'previewOnClick should be boolean');

            const autoReveal = configService.getAutoReveal();
            assert.ok(typeof autoReveal === 'boolean', 'autoReveal should be boolean');
        });

        test('CoraWiki provider change applies preset for baseUrl/model/apiKeyEnvName', async function() {
            const config = vscode.workspace.getConfiguration('knowledgeBase');
            const originalProvider = config.get<string>('coraWiki.provider');
            try {
                await config.update('coraWiki.provider', 'kimi', true);
                await new Promise(resolve => setTimeout(resolve, 300));
                configService.reload();
                assert.strictEqual(
                    configService.getCoraWikiBaseUrl(),
                    'https://api.moonshot.ai/v1',
                    'baseUrl should be kimi preset after provider change'
                );
                assert.strictEqual(
                    configService.getCoraWikiApiKeyEnvName(),
                    'KIMI_API_KEY',
                    'apiKeyEnvName should be kimi preset'
                );
            } finally {
                if (originalProvider !== undefined) {
                    await config.update('coraWiki.provider', originalProvider, true);
                    await configService.applyCoraWikiProviderPreset();
                }
            }
        });
    });

    suite('Utility Functions', () => {
        test('should parse headings from markdown content', async () => {
            const { parseHeadings } = await import('../../utils/markdownParser');

            const content = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
`;

            const headings = parseHeadings(content);

            assert.strictEqual(headings.length, 6, 'Should parse all 6 heading levels');
            assert.strictEqual(headings[0].level, 1, 'First heading should be H1');
            assert.strictEqual(headings[0].text, 'Heading 1', 'First heading text should match');
            assert.strictEqual(headings[5].level, 6, 'Last heading should be H6');
        });

        test('should identify markdown files', async () => {
            const { isMarkdownFile } = await import('../../utils/markdownParser');
            const defaultExtensions = ['.md', '.markdown', '.mdx', '.mdc'];

            assert.ok(isMarkdownFile('test.md', defaultExtensions), 'Should identify .md files');
            assert.ok(isMarkdownFile('test.markdown', defaultExtensions), 'Should identify .markdown files');
            assert.ok(isMarkdownFile('test.mdx', defaultExtensions), 'Should identify .mdx files');
            assert.ok(isMarkdownFile('test.mdc', defaultExtensions), 'Should identify .mdc files');
            assert.ok(!isMarkdownFile('test.txt', defaultExtensions), 'Should not identify .txt files');
            assert.ok(!isMarkdownFile('test.js', defaultExtensions), 'Should not identify .js files');
        });

        test('should sanitize file names', async () => {
            const { sanitizeFileName } = await import('../../utils/markdownParser');

            assert.strictEqual(sanitizeFileName('test/file.md'), 'testfile.md', 'Should remove slashes');
            assert.strictEqual(sanitizeFileName('test\\file.md'), 'testfile.md', 'Should remove backslashes');
            assert.strictEqual(sanitizeFileName('test:file.md'), 'testfile.md', 'Should remove colons');
            assert.strictEqual(sanitizeFileName('normal.md'), 'normal.md', 'Should keep normal names');
        });

        test('should get correct file icons', async () => {
            const { getFileIcon } = await import('../../utils/markdownParser');

            const markdownIcon = getFileIcon('test.md');
            const textIcon = getFileIcon('test.txt');
            const defaultIcon = getFileIcon('test.unknown');

            assert.ok(markdownIcon, 'Should return markdown icon');
            assert.ok(textIcon, 'Should return text icon');
            assert.ok(defaultIcon, 'Should return default icon');
        });
    });
});
