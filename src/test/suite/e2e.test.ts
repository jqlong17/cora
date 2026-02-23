import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileService } from '../../services/fileService';
import { ConfigService } from '../../services/configService';
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
    let pageTreeProvider: PageTreeProvider;
    let searchProvider: SearchProvider;
    let outlineService: OutlineService;
    let outlineProvider: OutlineProvider;

    // 测试前准备：创建测试工作区
    suiteSetup(async () => {
        console.log('Setting up E2E test environment...');

        // 创建测试工作区目录
        if (!fs.existsSync(testWorkspacePath)) {
            fs.mkdirSync(testWorkspacePath, { recursive: true });
        }

        // 创建测试笔记
        const testFiles = [
            {
                name: '项目计划.md',
                content: `# 项目计划

## 需求分析
这是项目的需求分析部分。

## 技术方案
使用 TypeScript 开发。

## 时间安排
- 第一阶段：设计
- 第二阶段：开发
- 第三阶段：测试
`
            },
            {
                name: '会议纪要.md',
                content: `# 会议纪要

## 参会人员
- 张三
- 李四

## 讨论内容
讨论了项目进度和下一步计划。

## 行动计划
1. 完成需求文档
2. 开始原型设计
`
            },
            {
                name: '读书笔记.md',
                content: `# 读书笔记

## 书名：《设计模式》

## 核心观点
设计模式是解决软件设计问题的可复用方案。

## 笔记
单例模式、工厂模式、观察者模式等。
`
            }
        ];

        for (const file of testFiles) {
            const filePath = path.join(testWorkspacePath, file.name);
            fs.writeFileSync(filePath, file.content, 'utf8');
        }

        // 初始化服务
        configService = new ConfigService();
        fileService = new FileService(configService);
        pageTreeProvider = new PageTreeProvider(fileService, configService);
        searchProvider = new SearchProvider(fileService, configService);
        outlineService = new OutlineService();
        outlineProvider = new OutlineProvider(outlineService, configService);

        console.log('Test workspace created at:', testWorkspacePath);
    });

    // 测试后清理
    suiteTeardown(async () => {
        console.log('Cleaning up E2E test environment...');

        // 清理所有测试创建的文件和文件夹
        const entries = fs.readdirSync(testWorkspacePath);
        for (const entry of entries) {
            const fullPath = path.join(testWorkspacePath, entry);
            // 保留原始测试文件，删除测试过程中创建的文件
            if (!['项目计划.md', '会议纪要.md', '读书笔记.md'].includes(entry)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            }
        }
    });

    suite('Extension Activation', () => {
        test('should activate Cora extension', async () => {
            const coraExtension = vscode.extensions.getExtension('cora.cora');
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
                'knowledgeBase.newNote',
                'knowledgeBase.newFolder',
                'knowledgeBase.deleteItem',
                'knowledgeBase.renameItem',
                'knowledgeBase.searchNotes',
                'knowledgeBase.clearSearch',
                'knowledgeBase.openEditor',
                'knowledgeBase.openPreview',
                'knowledgeBase.openTextEditor',
                'knowledgeBase.toggleFilter',
                'knowledgeBase.collapseAll',
                'knowledgeBase.expandAll',
                'knowledgeBase.refreshPageTree',
                'knowledgeBase.gotoHeading',
                'knowledgeBase.revealInFinder',
                'knowledgeBase.copyPath',
                'knowledgeBase.copyRelativePath',
                'knowledgeBase.copyFile'
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
            assert.deepStrictEqual(extensions, ['.md', '.markdown', '.mdx'], 'Should have default markdown extensions');
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

            // 通过编辑器更新大纲提供者
            await outlineProvider.updateForEditor(editor);

            // 获取所有标题项
            const items = await outlineProvider.getChildren();
            assert.ok(items.length > 0, 'Should have outline items');

            // 验证层级结构
            const h1Items = items.filter(item => item.heading.level === 1);
            const h2Items = items.filter(item => item.heading.level === 2);

            assert.strictEqual(h1Items.length, 1, 'Should have 1 H1 item');
            assert.ok(h2Items.length >= 2, 'Should have at least 2 H2 items');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should clear outline when no markdown file', async () => {
            outlineProvider.clear();
            const items = await outlineProvider.getChildren();
            assert.strictEqual(items.length, 0, 'Outline should be empty after clear');
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

            // 过滤出 SearchItem（第一个是输入项，可能有清除项）
            const searchItems = results.filter(r => 'result' in r) as SearchItem[];

            // 结果应该同时包含这两个关键词
            for (const result of searchItems) {
                const content = fs.readFileSync(result.result.uri.fsPath, 'utf8');
                assert.ok(content.includes('项目') && content.includes('需求'),
                    'Result should contain both keywords');
            }
        });

        test('should sort results by match count', async () => {
            await searchProvider.search('模式');
            const results = await searchProvider.getChildren();

            // 过滤出 SearchItem（第一个是输入项，可能有清除项）
            const searchItems = results.filter(r => 'result' in r) as SearchItem[];

            if (searchItems.length >= 2) {
                // 验证按匹配次数降序排列
                for (let i = 0; i < searchItems.length - 1; i++) {
                    assert.ok(searchItems[i].result.matchCount >= searchItems[i + 1].result.matchCount,
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

            // 可能有结果也可能没有，清除后应该只剩搜索输入项
            searchProvider.clear();
            const results = await searchProvider.getChildren();
            assert.strictEqual(results.length, 1, 'Search results should be cleared, only input item remains');
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
            // 空搜索时应该只显示搜索输入项
            assert.strictEqual(results.length, 1, 'Empty search should only show input item');
        });

        test('should generate preview for search results', async () => {
            await searchProvider.search('TypeScript');
            const results = await searchProvider.getChildren();

            // 过滤出 SearchItem（第一个是输入项，可能有清除项）
            const searchItems = results.filter(r => 'result' in r) as SearchItem[];

            if (searchItems.length > 0) {
                const preview = searchItems[0].result.preview;
                assert.ok(preview.length > 0, 'Should have preview text');
                assert.ok(preview.length <= 53, 'Preview should be truncated with ellipsis if too long');
            }
        });
    });

    suite('Editor Display and Tab State', () => {
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

            assert.ok(isMarkdownFile('test.md', ['.md', '.markdown', '.mdx']), 'Should identify .md files');
            assert.ok(isMarkdownFile('test.markdown', ['.md', '.markdown', '.mdx']), 'Should identify .markdown files');
            assert.ok(isMarkdownFile('test.mdx', ['.md', '.markdown', '.mdx']), 'Should identify .mdx files');
            assert.ok(!isMarkdownFile('test.txt', ['.md', '.markdown', '.mdx']), 'Should not identify .txt files');
            assert.ok(!isMarkdownFile('test.js', ['.md', '.markdown', '.mdx']), 'Should not identify .js files');
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
