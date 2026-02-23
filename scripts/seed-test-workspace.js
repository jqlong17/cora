/**
 * 填充 test-workspace，与 e2e.test.ts 的 suiteSetup 保持一致。
 * 运行方式：npm run seed-test-workspace
 * 之后可用 launch 配置「Run Extension (Test Workspace)」打开该文件夹进行调试。
 */

const fs = require('fs');
const path = require('path');

const testWorkspacePath = path.resolve(__dirname, '../test-workspace');

const testFiles = [
    { name: '项目计划.md', content: `# 项目计划

## 需求分析
这是项目的需求分析部分。需要明确功能范围、用户角色与验收标准。

### 功能范围
- 知识库管理：页面树、全文搜索、大纲导航
- 编辑体验：Markdown 预览、快捷键、多关键词搜索
- 扩展配置：过滤模式、平铺/树形、点击是否默认预览

### 非功能需求
性能：大工作区下树与搜索需可接受延迟。兼容：VS Code / Cursor 主流版本。

## 技术方案
使用 TypeScript 开发，依赖 VS Code 扩展 API。

### 前端
- 树视图：TreeDataProvider，支持平铺按修改时间排序
- 大纲：从当前文档解析标题层级
- 搜索：多关键词 AND，无结果时降级 OR

### 后端与配置
配置项通过 workspace.getConfiguration 读写，无独立后端。

## 时间安排
- 第一阶段：设计（架构、配置项、UI 草图）
- 第二阶段：开发（核心命令、视图、搜索与大纲）
- 第三阶段：测试（单元 + E2E，修复回归）
` },
    { name: '会议纪要.md', content: `# 会议纪要

## 参会人员
- 张三（产品）
- 李四（开发）
- 王五（测试）

## 讨论内容
讨论了项目进度和下一步计划。当前完成度约 60%，树形视图与搜索已可用，大纲与配置需收尾。

### 风险与依赖
- 依赖 VS Code Markdown 预览 API，需验证各版本行为
- 大仓库下首次扫描可能较慢，考虑增量或缓存

## 决议事项
1. 下周五前完成全部配置项与文档
2. 预留一天做兼容性测试

## 行动计划
1. 完成需求文档并评审
2. 开始原型设计与交互细节
3. 排期 E2E 与性能用例
` },
    { name: '读书笔记.md', content: `# 读书笔记

## 书名：《设计模式》

## 核心观点
设计模式是解决软件设计问题的可复用方案，强调面向接口编程与组合优于继承。

### 创建型
单例、工厂方法、抽象工厂、建造者、原型。常用：工厂与单例。

### 结构型
适配器、桥接、组合、装饰器、外观、享元、代理。常用：适配器与装饰器。

### 行为型
责任链、命令、解释器、迭代器、中介者、备忘录、观察者、状态、策略、模板方法、访问者。常用：观察者与策略。

## 笔记
单例模式、工厂模式、观察者模式等在业务代码中经常出现；结合 TypeScript 的接口与泛型可以写得更清晰。
` }
];

const longDocContent = `# 长文档：知识库使用指南

## 简介
本文档用于 E2E 测试中的长文场景，包含多级标题与较多段落，便于验证大纲折叠、搜索高亮与滚动等行为。

## 安装与配置

### 安装扩展
在 VS Code 或 Cursor 的扩展市场搜索 Cora，安装后重载窗口即可。

### 工作区要求
扩展依赖当前工作区根目录，请用「文件 -> 打开文件夹」打开你的笔记根目录（可包含多个子文件夹）。

### 常用配置项
- \`knowledgeBase.previewOnClick\`：点击侧栏文件时是否默认打开预览
- \`knowledgeBase.filterMode\`：默认「仅 Markdown」或「显示全部文件」
- \`knowledgeBase.pageViewMode\`：平铺或树形

## 页面树

### 平铺模式
所有 Markdown 文件按修改时间降序排列，便于快速找到最近编辑的文档。

### 树形模式
按磁盘目录结构展示，支持新建笔记、新建文件夹、重命名、删除等操作。

### 过滤
可切换「显示全部文件」与「仅显示 MD 文件」，标题栏按钮会显示当前状态。

## 大纲
打开任意 Markdown 文件后，大纲视图会解析 H1～H6 标题并支持点击跳转。支持全部展开与全部折叠。

## 搜索
支持单个或多个关键词（空格分隔）。多关键词为 AND 逻辑；若无结果会自动降级为 OR。搜索结果展示文件名、匹配次数与预览片段。

## 小结
以上内容仅作测试数据，用于验证扩展在长文档、多层级下的表现。
`;

const nestedFiles = [
    { dir: 'docs', file: '需求文档.md', content: `# 需求文档

## 功能列表
- 用户登录：支持邮箱/手机号与密码，可选记住登录状态
- 数据导出：支持导出为 CSV、Excel，可按时间范围筛选
- 权限管理：角色分为管理员、编辑、只读，支持按目录授权

## 非功能
- 响应时间：列表与搜索 P95 < 2s
- 兼容：Chrome / Edge 最新两个大版本
` },
    { dir: 'docs', file: '设计文档.md', content: `# 设计文档

## 架构
- 前端：React + TypeScript，组件按功能模块划分
- 后端：Node.js + Express，RESTful API
- 数据库：PostgreSQL，读写分离
- 缓存：Redis 用于会话与热点数据

## 模块划分
- 用户中心：注册、登录、个人设置
- 业务核心：订单、支付、库存
- 运营后台：报表、审核、配置
` },
    { dir: 'notes/2024', file: '周报-01.md', content: `# 周报 第1周

## 完成项
- 需求评审：与产品对齐 MVP 范围与优先级
- 技术选型：确定前后端栈与部署方式
- 环境搭建：开发/测试/预发环境与 CI 流水线

## 下周计划
- 完成详细设计文档与接口定义
- 启动用户模块开发
` },
    { dir: 'notes/2024', file: '周报-02.md', content: `# 周报 第2周

## 完成项
- 接口设计：核心 API 的请求/响应与错误码
- 数据库表设计：用户、订单、日志等主表与索引
- 用户模块：注册、登录、Token 刷新接口已联调

## 风险与阻塞
- 第三方登录需等企业资质审批，暂时仅支持账号密码
` },
    { dir: '参考', file: '长文档.md', content: longDocContent }
];

if (!fs.existsSync(testWorkspacePath)) {
    fs.mkdirSync(testWorkspacePath, { recursive: true });
}

for (const f of testFiles) {
    fs.writeFileSync(path.join(testWorkspacePath, f.name), f.content, 'utf8');
}

for (const f of nestedFiles) {
    const dir = path.join(testWorkspacePath, f.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, f.file), f.content, 'utf8');
}

console.log('test-workspace 已填充:', testWorkspacePath);
console.log('可用 launch 配置「Run Extension (Test Workspace)」打开该文件夹后 F5 调试。');
