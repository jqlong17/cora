# Cora

VS Code 知识管理插件，提供页面树、大纲导航、数据库视图等知识管理功能，让 VS Code 成为高效的知识工作空间。

## 功能特性

### 📄 页面树 (Page Tree)
- **文件树视图**: 以工作区根目录为起点，展示完整文件层级
- **智能过滤**: 支持【全部文件】和【仅 Markdown】两种模式切换
- **快速操作**: 新建笔记、新建文件夹、重命名、删除
- **展开/折叠**: 全部展开、全部折叠功能

### 📋 大纲 (Outline)
- **实时跟随**: 自动跟随当前激活的编辑器
- **标题层级**: 自动提取 H1-H6 标题层级结构
- **快速跳转**: 点击大纲项即可跳转到文档对应位置
- **层级缩进**: 清晰展示文档结构层次

### 🗄️ 数据库 (Database)
- **MVP 预留**: 当前版本为功能占位
- **未来功能**: 支持表格/看板视图、frontmatter 属性管理、筛选排序

## 使用指南

### 安装

1. 在 VS Code 扩展市场中搜索 "Cora"
2. 点击安装
3. 安装完成后，左侧活动栏会出现 📖 Cora 图标

### 快速开始

1. **打开 Cora 面板**
   - 点击左侧活动栏的 📖 Cora 图标
   - 或使用快捷键 `Cmd+Shift+P` 输入 "Cora"

2. **浏览文件**
   - 在【页面】标签中查看工作区文件树
   - 使用顶部按钮切换【全部/Markdown】过滤模式

3. **阅读文档**
   - 点击 Markdown 文件 → 默认打开预览
   - 查看【大纲】标签了解文档结构
   - 点击大纲项跳转到对应章节

4. **编辑文档**
   - 在预览状态下按 `Cmd+E` 切换到编辑模式
   - 或使用 `Cmd+Shift+V` 从编辑切换到预览

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+V` | 打开 Markdown 预览 |
| `Cmd+E` | 从预览切换到编辑模式 |

### 命令面板

按 `Cmd+Shift+P` 打开命令面板，搜索以下命令：

- `Cora: 刷新页面树`
- `Cora: 切换过滤`
- `Cora: 显示全部文件`
- `Cora: 仅显示 Markdown`
- `Cora: 全部展开`
- `Cora: 全部折叠`
- `Cora: 新建笔记`
- `Cora: 新建文件夹`

## 配置选项

在 VS Code 设置中搜索 "knowledgeBase" 进行配置：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `knowledgeBase.filterMode` | string | `"markdown"` | 页面树的文件过滤模式 |
| `knowledgeBase.markdownExtensions` | array | `[".md", ".markdown", ".mdx"]` | 识别的 Markdown 文件扩展名 |
| `knowledgeBase.previewOnClick` | boolean | `true` | 点击文件时默认打开预览 |
| `knowledgeBase.autoReveal` | boolean | `true` | 自动在页面树中显示当前打开的文件 |
| `knowledgeBase.showOutlineForNonMarkdown` | boolean | `false` | 为非 Markdown 文件显示大纲 |

## 路线图

### Phase 1 (MVP) ✅
- [x] 页面树视图（文件树 + Markdown/全部过滤）
- [x] 大纲视图（实时跟随激活编辑器）
- [x] 点击文件默认预览，支持切换到编辑
- [x] 大纲点击跳转

### Phase 2 🚧
- [ ] 数据库视图
- [ ] 表格/看板展示 Markdown 文件
- [ ] frontmatter 属性管理
- [ ] 筛选、排序、分组功能

### Phase 3 🔮
- [ ] WYSIWYG 编辑器
- [ ] 双向链接支持 [[页面名]]
- [ ] 标签系统

### Phase 4 🔮
- [ ] AI 集成
- [ ] 与右侧 AI 面板联动
- [ ] 基于 Cora 的问答、总结

## 技术架构

- **VS Code Engine**: ^1.96.0
- **TypeScript**: ^5.5.0
- **核心 API**:
  - `TreeDataProvider` - 页面树、大纲数据提供
  - `createTreeView` - 视图注册
  - `workspace` - 文件系统监听

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监视模式
npm run watch

# 测试
npm run test

# 打包
vsce package
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动扩展开发主机
3. 在开发主机中测试功能

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- 图标使用 VS Code 内置 Codicon
- 设计灵感来自 Notion、Obsidian 等知识管理工具
