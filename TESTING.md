# Cora 测试指南

本文档介绍如何自动化测试 Cora 扩展，无需手动在 Cursor 中操作。

## 测试策略

Cora 采用三层测试策略：

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: E2E UI Tests (Playwright)                        │
│  - 真实用户操作                                             │
│  - 覆盖关键用户流程                                         │
│  - 慢但最可靠                                               │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Integration Tests (@vscode/test-electron)        │
│  - 在真实 VS Code 实例中测试                                │
│  - 测试扩展 API 和命令                                      │
│  - 中等速度                                                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Unit Tests                                        │
│  - 纯函数测试                                               │
│  - 工具函数、解析器                                         │
│  - 快速                                                     │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 方式 1：运行集成测试（推荐）

这是 VS Code 扩展的标准测试方式，在独立的 VS Code 窗口中运行：

```bash
# 运行所有测试
npm test

# 或者使用 VS Code 调试
# 1. 打开 VS Code
# 2. 切换到调试面板 (Cmd+Shift+D)
# 3. 选择 "Extension Tests"
# 4. 按 F5
```

测试会自动：
1. 编译扩展
2. 启动 VS Code Extension Test Host
3. 运行 `src/test/suite/` 中的所有测试
4. 显示测试结果

### 方式 2：运行单元测试

```bash
# 单元测试包含在集成测试中
# 主要测试工具函数
```

### 方式 3：使用测试脚本

```bash
# 运行集成测试
./scripts/run-e2e-tests.sh integration

# 运行 Playwright UI 测试
./scripts/run-e2e-tests.sh playwright

# 运行所有测试
./scripts/run-e2e-tests.sh all
```

## 测试结构

```
src/test/
├── runTest.ts              # 测试入口
└── suite/
    ├── index.ts            # 测试套件配置
    ├── extension.test.ts   # 单元测试
    └── e2e.test.ts         # 集成/E2E 测试

e2e/
├── package.json            # Playwright 依赖
├── playwright.config.ts    # Playwright 配置
├── global-setup.ts         # 全局设置
├── global-teardown.ts      # 全局清理
├── README.md               # E2E 测试文档
└── tests/
    └── basic.spec.ts       # UI 测试用例
```

## 编写新测试

### 单元测试示例

测试工具函数，不依赖 VS Code API：

```typescript
// src/test/suite/extension.test.ts
import * as assert from 'assert';
import { parseHeadings } from '../../utils/markdownParser';

test('should parse markdown headings', () => {
    const content = `# Title\n## Subtitle`;
    const headings = parseHeadings(content);

    assert.strictEqual(headings.length, 2);
    assert.strictEqual(headings[0].text, 'Title');
});
```

### 集成测试示例

测试扩展功能和 VS Code API：

```typescript
// src/test/suite/e2e.test.ts
import * as vscode from 'vscode';
import * as assert from 'assert';

test('should open markdown file', async () => {
    // 创建测试文件
    const testFile = path.join(__dirname, 'test.md');
    fs.writeFileSync(testFile, '# Test');

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(testFile);
    const editor = await vscode.window.showTextDocument(doc);

    // 验证
    assert.ok(editor);
    assert.strictEqual(doc.languageId, 'markdown');

    // 清理
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
});

test('should execute commands', async () => {
    // 执行命令
    const result = await vscode.commands.executeCommand('knowledgeBase.newNote');

    // 验证命令可用
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('knowledgeBase.newNote'));
});
```

### 编辑区显示与 Tab 状态测试

测试点击 MD 文件后的编辑区显示效果和 Tab 切换状态：

```typescript
// 验证编辑区显示效果
test('should open markdown file in editor with correct display', async () => {
    const testFile = path.join(testWorkspacePath, '项目计划.md');
    const document = await vscode.workspace.openTextDocument(testFile);
    const editor = await vscode.window.showTextDocument(document);

    // 验证编辑器已打开
    assert.ok(editor, 'Editor should be opened');
    assert.strictEqual(editor.document.languageId, 'markdown');

    // 验证文档内容正确显示
    const content = editor.document.getText();
    assert.ok(content.includes('# 项目计划'), 'Should display H1 heading');

    // 验证编辑器处于编辑模式
    assert.ok(vscode.window.activeTextEditor, 'Should be in edit mode');
});

// 验证 Tab 切换状态
test('should switch to preview mode and reflect in tab state', async () => {
    const testFile = path.join(testWorkspacePath, '会议纪要.md');
    const document = await vscode.workspace.openTextDocument(testFile);
    await vscode.window.showTextDocument(document);

    // 切换到预览模式
    await vscode.commands.executeCommand('knowledgeBase.openPreview');

    // 验证 Tab 状态
    const previewTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(previewTab, 'Should have active tab');
    assert.ok(previewTab.label.includes('会议纪要'), 'Tab label should show filename');
});
```

### 关键测试用例

## 测试覆盖清单

### 功能测试（44 个测试用例）

| 模块 | 测试项 | 状态 |
|------|--------|------|
| **扩展激活** | 扩展激活 | ✅ |
| | 命令注册（18 个命令） | ✅ |
| **页面树** | Provider 创建 | ✅ |
| | 获取子项 | ✅ |
| | 刷新 | ✅ |
| | TreeItem 提供 | ✅ |
| **文件操作** | 新建笔记文件 | ✅ |
| | 新建文件夹 | ✅ |
| | 重命名文件 | ✅ |
| | 删除文件 | ✅ |
| | 获取工作区文件夹 | ✅ |
| **过滤和显示** | Markdown 过滤 | ✅ |
| | 全部文件过滤 | ✅ |
| | 获取扩展名列表 | ✅ |
| **大纲视图** | 标题提取 | ✅ |
| | 文档切换时更新 | ✅ |
| | 跳转到标题行 | ✅ |
| | 层级结构 | ✅ |
| | 清除大纲 | ✅ |
| **搜索功能** | 单关键词搜索 | ✅ |
| | 多关键词搜索（AND 逻辑） | ✅ |
| | 结果排序（匹配次数） | ✅ |
| | 清除搜索结果 | ✅ |
| | 获取最后查询 | ✅ |
| | 空搜索处理 | ✅ |
| | 搜索预览生成 | ✅ |
| **编辑区显示** | Markdown 文件正确显示 | ✅ |
| | 切换到预览模式 | ✅ |
| | 编辑/预览切换 | ✅ |
| | 从页面树打开更新大纲 | ✅ |
| | 多文件切换 Tab 状态 | ✅ |
| **右键菜单** | 复制路径到剪贴板 | ✅ |
| | 复制相对路径 | ✅ |
| | 复制文件 | ✅ |
| | 在 Finder 中打开 | ✅ |
| **配置** | 默认配置 | ✅ |
| | 配置更改 | ✅ |
| | 从 Service 获取配置 | ✅ |
| **工具函数** | Markdown 标题解析 | ✅ |
| | 文件类型识别 | ✅ |
| | 文件名净化 | ✅ |
| | 文件图标获取 | ✅ |

### 单元测试（5 个测试用例）

| 模块 | 测试项 | 状态 |
|------|--------|------|
| **markdownParser** | parseHeadings 提取标题 | ✅ |
| | parseHeadings 处理特殊字符 | ✅ |
| | isMarkdownFile 识别 | ✅ |
| | isMarkdownFile 大小写不敏感 | ✅ |
| | getFileIcon 返回正确图标 | ✅ |

## 调试测试

### 在 VS Code 中调试

1. 在测试文件中设置断点
2. 切换到调试面板
3. 选择 "Extension Tests"
4. 按 F5 启动

### 查看测试输出

测试结果会显示在：
- Debug Console（调试控制台）
- Terminal（终端）
- Test Explorer（如果安装了测试插件）

### 常见问题

**Q: 测试无法启动？**
A: 确保已运行 `npm install` 和 `npm run compile`

**Q: 测试找不到扩展？**
A: 确保 `out/extension.js` 存在

**Q: 测试超时？**
A: 增加超时时间：`--timeout 60000`

**Q: 如何只运行特定测试？**
A: 使用 `.only`：
```typescript
test.only('this test only', () => {
    // ...
});
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install

    - name: Compile
      run: npm run compile

    - name: Run tests
      run: npm test
```

## 测试最佳实践

1. **每个测试独立** - 不要依赖其他测试的状态
2. **清理资源** - 测试后关闭编辑器、删除临时文件
3. **使用超时** - 异步操作设置合理的超时时间
4. **描述清晰** - 测试名称说明测试的功能
5. **分层测试** - 简单的用单元测试，复杂的用集成测试

## 测试覆盖率

要查看测试覆盖率：

```bash
# 需要配置 nyc 或 c8
npm run test:coverage
```

## 下一步

- [ ] 完善 E2E 测试用例
- [ ] 添加性能测试
- [ ] 设置 CI/CD 自动化测试
- [ ] 添加可视化回归测试

## 参考

- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Mocha Documentation](https://mochajs.org/)
