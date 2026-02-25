/**
 * 填充 test-workspace 的唯一样本数据，仅覆盖各类测试场景，不重复同类文档。
 * - 根目录：项目计划.md、会议纪要.md、读书笔记.md、短诗.md（中英短诗测字体）、示例.html、说明.txt
 * - 子目录：notes/2024/周报-02.md（平铺排序用）
 * - 运行前会删除陈旧项：项目进度计划.md、架构设计方案.md、数据模型定义.md、docs/、参考/
 * - 运行：npm run seed-test-workspace；E2E 与 F5 Test Workspace 均使用本脚本。
 */

const fs = require('fs');
const path = require('path');

const testWorkspacePath = path.resolve(__dirname, '../test-workspace');

// 陈旧项（历史遗留，与当前 seed 定义重复）：删除以保证工作区与脚本一致
const obsoletePaths = [
    '项目进度计划.md',
    '架构设计方案.md',
    '数据模型定义.md',
    'docs',
    '参考'
];

// 根目录：综合 MD（带图、标题、文本、mermaid、代码块、表格、HTML 表、强调）
const 项目计划Content = `# 项目计划

## 需求分析
这是项目的需求分析部分。需要明确**功能范围**、用户角色与验收标准。支持 *斜体*、~~删除线~~ 与 \`行内代码\`。

### 功能范围
- 知识库管理：页面树、全文搜索、大纲导航
- 编辑体验：Markdown 预览、快捷键、多关键词搜索

### 流程图示例

\`\`\`mermaid
sequenceDiagram
    participant A as 客户端
    participant B as 服务端
    A->>B: 请求
    B-->>A: 响应
\`\`\`

### 代码块示例

\`\`\`javascript
function hello() {
  console.log('Hello');
}
\`\`\`

### Markdown 表格

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| A   | B   | C   |
| 1   | 2   | 3   |

### HTML 表格

<table>
<tr><th>名称</th><th>说明</th></tr>
<tr><td>项目计划</td><td>本示例文档</td></tr>
</table>

### 配图（Unsplash 测试外链图）

![示例图](https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400)

## 技术方案
使用 TypeScript 开发，依赖 VS Code 扩展 API。

## 时间安排
- 第一阶段：设计
- 第二阶段：开发
- 第三阶段：测试
`;

// 根目录：简短 MD，供 E2E 按路径断言
const 会议纪要Content = `# 会议纪要

## 参会人员
- 张三（产品）
- 李四（开发）

## 讨论内容
讨论了项目进度和下一步计划。
`;

const 读书笔记Content = `# 读书笔记

## 书名：《设计模式》

## 笔记
单例、工厂、观察者等模式在业务代码中常用。
`;

// 根目录：中英现代短诗，用于测试字体与排版效果
const 短诗Content = `# 短诗（字体效果测试）

## 中文

**窗**
光线切进房间以前
我们已把彼此
认成同一块暗

**夜行**
路在脚下变薄
星子像未发送的句号
悬在头顶

## English

**Still**
Before the screen glows
we are the same silence
waiting for the same word

**Drift**
The line breaks where you stopped reading.
The rest is margin—white, unsent.
`;

// 根目录：HTML 文件（带表格）
const 示例HtmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>示例</title></head>
<body>
<h1>示例页面</h1>
<table>
<tr><th>类型</th><th>说明</th></tr>
<tr><td>HTML</td><td>测试非 MD 文件</td></tr>
</table>
</body>
</html>
`;

// 根目录：非 MD 文本
const 说明TxtContent = `本工作区为 Cora 测试用样本数据。
包含：MD（标题/文本/mermaid/代码/表格/强调/图）、HTML、TXT、子文件夹、非 MD 文件。
`;

// 子目录 MD（仅保留一个，用于平铺按 mtime 排序测试）
const 周报02Content = `# 周报 第2周

## 完成项
- 接口设计、数据库设计、用户模块联调

## 风险与阻塞
- 第三方登录待企业资质审批
`;

// 根目录文件
const rootFiles = [
    { name: '项目计划.md', content: 项目计划Content },
    { name: '会议纪要.md', content: 会议纪要Content },
    { name: '读书笔记.md', content: 读书笔记Content },
    { name: '短诗.md', content: 短诗Content },
    { name: '示例.html', content: 示例HtmlContent },
    { name: '说明.txt', content: 说明TxtContent }
];

// 子目录文件（不含图片）
const nestedFiles = [
    { dir: 'notes/2024', file: '周报-02.md', content: 周报02Content }
];

if (!fs.existsSync(testWorkspacePath)) {
    fs.mkdirSync(testWorkspacePath, { recursive: true });
}

for (const name of obsoletePaths) {
    const p = path.join(testWorkspacePath, name);
    if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
    }
}

for (const f of rootFiles) {
    fs.writeFileSync(path.join(testWorkspacePath, f.name), f.content, 'utf8');
}

for (const f of nestedFiles) {
    const dir = path.join(testWorkspacePath, f.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, f.file), f.content, 'utf8');
}

console.log('test-workspace 已填充:', testWorkspacePath);
console.log('根目录:', rootFiles.map(f => f.name).join(', '));
console.log('子目录: notes/2024/');
console.log('配图: 项目计划.md 内使用 Unsplash 外链');
console.log('可用 launch「Run Extension (Test Workspace)」打开后 F5 调试。');
