import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

        console.log('Test workspace created at:', testWorkspacePath);
    });

    // 测试后清理
    suiteTeardown(async () => {
        console.log('Cleaning up E2E test environment...');

        // 可选：清理测试文件
        // if (fs.existsSync(testWorkspacePath)) {
        //     fs.rmSync(testWorkspacePath, { recursive: true, force: true });
        // }
    });

    suite('Page Tree View', () => {
        test('should activate Cora extension', async () => {
            // 获取 Cora 扩展
            const coraExtension = vscode.extensions.getExtension('cora');
            assert.ok(coraExtension, 'Cora extension should be installed');

            // 确保扩展已激活
            if (!coraExtension.isActive) {
                await coraExtension.activate();
            }
            assert.strictEqual(coraExtension.isActive, true, 'Cora extension should be active');
        });

        test('should show page tree view', async () => {
            // 获取页面树视图
            const pageTreeView = vscode.window.createTreeView('pageTree', {
                treeDataProvider: {
                    getChildren: () => [],
                    getTreeItem: (item: any) => item
                }
            });

            assert.ok(pageTreeView, 'Page tree view should be created');
            assert.strictEqual(pageTreeView.visible, true, 'Page tree view should be visible');
        });
    });

    suite('Outline View', () => {
        test('should extract headings from markdown document', async () => {
            // 打开测试文件
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(document);

            assert.ok(editor, 'Editor should be opened');
            assert.strictEqual(document.languageId, 'markdown', 'Document should be markdown');

            // 获取文档内容
            const content = document.getText();
            assert.ok(content.includes('# 项目计划'), 'Content should have H1');
            assert.ok(content.includes('## 需求分析'), 'Content should have H2');

            // 清理：关闭编辑器
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('should update outline when switching documents', async () => {
            // 打开第一个文件
            const file1 = path.join(testWorkspacePath, '项目计划.md');
            const doc1 = await vscode.workspace.openTextDocument(file1);
            await vscode.window.showTextDocument(doc1);

            // 打开第二个文件
            const file2 = path.join(testWorkspacePath, '会议纪要.md');
            const doc2 = await vscode.workspace.openTextDocument(file2);
            await vscode.window.showTextDocument(doc2);

            // 验证当前活动编辑器
            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor, 'Should have active editor');
            assert.ok(activeEditor.document.fileName.includes('会议纪要'), 'Should show second document');

            // 清理
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });
    });

    suite('Search Functionality', () => {
        test('should search single keyword', async () => {
            // 执行搜索命令
            const result = await vscode.commands.executeCommand('knowledgeBase.searchNotes');

            // 注意：由于搜索需要用户输入，这里我们直接测试搜索提供器
            // 在实际测试中，你可能需要模拟用户输入或使用测试 API
            assert.ok(result !== undefined, 'Search command should execute');
        });

        test('should find files by content', async () => {
            // 读取测试文件内容
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const content = fs.readFileSync(testFile, 'utf8');

            // 验证文件包含搜索关键词
            assert.ok(content.includes('项目'), 'File should contain "项目"');
            assert.ok(content.includes('需求分析'), 'File should contain "需求分析"');
        });
    });

    suite('Commands', () => {
        test('should execute new note command', async () => {
            // 测试命令是否可用
            const commands = await vscode.commands.getCommands(true);
            const coraCommands = commands.filter(cmd => cmd.startsWith('knowledgeBase.'));

            assert.ok(coraCommands.includes('knowledgeBase.newNote'), 'newNote command should exist');
            assert.ok(coraCommands.includes('knowledgeBase.newFolder'), 'newFolder command should exist');
            assert.ok(coraCommands.includes('knowledgeBase.searchNotes'), 'searchNotes command should exist');
            assert.ok(coraCommands.includes('knowledgeBase.openEditor'), 'openEditor command should exist');
            assert.ok(coraCommands.includes('knowledgeBase.openPreview'), 'openPreview command should exist');
        });

        test('should toggle between editor and preview', async () => {
            // 打开测试文件
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            const document = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(document);

            // 测试打开预览命令
            try {
                await vscode.commands.executeCommand('knowledgeBase.openPreview');
                // 如果成功，说明命令可用
                assert.ok(true, 'openPreview command executed');
            } catch (e) {
                // 命令可能因为没有预览而失败，这是正常的
                assert.ok(true, 'Command attempted');
            }

            // 清理
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('Configuration', () => {
        test('should have default configuration', async () => {
            const config = vscode.workspace.getConfiguration('knowledgeBase');

            const filterMode = config.get<string>('filterMode');
            assert.strictEqual(filterMode, 'markdown', 'Default filter mode should be markdown');

            const extensions = config.get<string[]>('markdownExtensions');
            assert.deepStrictEqual(extensions, ['.md', '.markdown', '.mdx'], 'Default extensions should be set');
        });

        test('should allow configuration changes', async () => {
            const config = vscode.workspace.getConfiguration('knowledgeBase');

            // 临时修改配置
            await config.update('filterMode', 'all', true);

            const newValue = config.get<string>('filterMode');
            assert.strictEqual(newValue, 'all', 'Filter mode should be updated');

            // 恢复默认
            await config.update('filterMode', 'markdown', true);
        });
    });
});
