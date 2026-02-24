# Feature 分支：优化大纲与预览体验（feature/outline-icon-simplify）

## 一、大纲相关

### 1. 大纲图标简化
- 移除大纲项前的复杂 ThemeIcon（symbol-key、symbol-enum 等），仅用 **H1、H2、H3** 等文字作为层级标识（通过 `description` 展示），界面更简洁。

### 2. 点击大纲「没有活动的编辑器」修复
- **命令参数**：TreeItem 的 `command.arguments` 改为传 `documentUri.toString()` 字符串，避免 VS Code 序列化 vscode.Uri 后丢失类型。
- **gotoHeading**：支持 `documentUriStr`、`previewProvider.getCurrentUri()`、`outlineProvider.getCurrentDocumentUri()` 三层 fallback，确保在预览/编辑模式下点击大纲能正确打开文档并跳转。
- **openPreview / openEditor**：在命令中主动设置 `lastKnownUri` 并调用 `outlineProvider.updateForUri(uri)`，不依赖事件链，保证从页面树打开时大纲有正确文档来源。

### 3. 大纲内容不更新 / 不实时更新修复
- **缓存**：`updateForDocument` 改为使用 `getHeadingsFromContent(document.getText())`，不再依赖 OutlineService 缓存，保证每次读到最新内容。
- **防抖**：`updateForEditor` 增加 300ms 防抖，避免每次按键并发解析导致乱序或卡顿。
- **编辑模式（Webview）实时大纲**：
  - PreviewProvider 增加 `onContentChanged(uri, content)` 回调，extension 中调用 `outlineProvider.updateFromContent(uri, content)`。
  - 编辑页 textarea 的 `input` 事件防抖 250ms 后向扩展发送 `outlineUpdate` 消息，扩展收到后刷新大纲。
  - 切换到「编辑」时加载完 HTML 后立即调用 `onContentChanged` 同步一次大纲。
  - 当焦点在 Cora Webview 标签时，不再在 `onDidChangeActiveTextEditor(undefined)` 里用 `updateForUri` 从磁盘覆盖大纲，避免冲掉未保存的编辑内容。

### 4. 编辑模式保存后刷新大纲
- PreviewProvider 增加 `onDocumentSaved(uri)` 回调；在 `saveAndPreview` 写盘后调用，extension 中对应 `outlineProvider.updateForUri(uri)`，保证点击「预览」保存后左侧大纲立即刷新。

### 5. 测试
- 新增 E2E：`should refresh outline after document save`、`should update outline in real-time when editing in text editor`。
- 已有用例 `should handle outline hierarchy` 在 `updateForEditor` 后增加 400ms 等待以适配防抖。

---

## 二、预览 / 编辑 UI

### 1. 工具栏固定
- 预览与编辑两个 HTML 模板中，`.cora-toolbar-wrap` 使用 `position: fixed; top: 0; right: 0; z-index: 10` 固定到右上角，`body` 增加 `padding-top: 48px`，切换预览/编辑时按钮位置不再因布局或滚动条变化而偏移。

### 2. 布局比例（左侧栏）
- `package.json` 中页面树、大纲、搜索三个视图设置 `size`：pageTree 2、kbOutline 1、search 1，默认约 50% / 25% / 25%，用户仍可手动调整。

---

## 三、页面模块

### 1. 默认树形展示
- `knowledgeBase.pageViewMode` 默认值由 `flat` 改为 `tree`，ConfigService 中对应默认改为 `'tree'`。

### 2. 新建笔记 / 新建文件夹
- 输入框 prompt 显示「将创建于: \<相对路径\>/」，明确创建位置。
- 无选中项时，先 `treeView.reveal(roots[0])` 再弹出输入框，视觉上更贴近树内创建。
- 标题栏增加「新建文件夹」按钮（与新建笔记同一组），逻辑与右键「新建文件夹」一致。

---

## 涉及文件

- `package.json`：视图 size、新建文件夹 view/title、pageViewMode 默认值。
- `src/commands/fileOperations.ts`：newNote/newFolder 支持 treeView、reveal、prompt 路径。
- `src/commands/navigationCommands.ts`：gotoHeading 支持 documentUriStr 与多层 fallback。
- `src/extension.ts`：PreviewProvider 回调、openPreview/openEditor 主动更新大纲、gotoHeading 传 outlineProvider、Webview 焦点时不再覆盖大纲。
- `src/providers/outlineProvider.ts`：图标移除、documentUri 传参、updateFromContent、防抖、updateForDocument 用 getHeadingsFromContent。
- `src/providers/previewProvider.ts`：onDocumentSaved/onContentChanged、outlineUpdate 处理、编辑页防抖 postMessage、openMarkdown 时同步大纲、工具栏 fixed。
- `src/services/configService.ts`：pageViewMode 默认 'tree'。
- `src/test/suite/e2e.test.ts`：新增与调整的 E2E 用例。
