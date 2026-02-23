#!/usr/bin/env node
/**
 * 在 test-workspace 中生成完整演示结构（根目录 3 个 md + docs/ + notes/2024/），
 * 并设置不同 mtime，便于体验平铺模式「按修改时间降序」。
 * 使用：npm run seed-test-workspace，然后用 VS Code 打开 test-workspace 文件夹。
 */

const fs = require('fs');
const path = require('path');

const testWorkspacePath = path.resolve(__dirname, '../test-workspace');

if (!fs.existsSync(testWorkspacePath)) {
  fs.mkdirSync(testWorkspacePath, { recursive: true });
}

const rootFiles = [
  { name: '项目计划.md', content: '# 项目计划\n\n## 需求分析\n这是项目的需求分析部分。\n\n## 技术方案\n使用 TypeScript 开发。\n\n## 时间安排\n- 第一阶段：设计\n- 第二阶段：开发\n- 第三阶段：测试\n' },
  { name: '会议纪要.md', content: '# 会议纪要\n\n## 参会人员\n- 张三\n- 李四\n\n## 讨论内容\n讨论了项目进度和下一步计划。\n\n## 行动计划\n1. 完成需求文档\n2. 开始原型设计\n' },
  { name: '读书笔记.md', content: '# 读书笔记\n\n## 书名：《设计模式》\n\n## 核心观点\n设计模式是解决软件设计问题的可复用方案。\n\n## 笔记\n单例模式、工厂模式、观察者模式等。\n' }
];

for (const f of rootFiles) {
  const filePath = path.join(testWorkspacePath, f.name);
  fs.writeFileSync(filePath, f.content, 'utf8');
}

const docsDir = path.join(testWorkspacePath, 'docs');
const notes2024Dir = path.join(testWorkspacePath, 'notes', '2024');
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(notes2024Dir, { recursive: true });

const nestedFiles = [
  { path: path.join(docsDir, '需求文档.md'), content: '# 需求文档\n\n## 功能列表\n- 用户登录\n- 数据导出\n', mtimeOffsetMs: -2 * 24 * 60 * 60 * 1000 },
  { path: path.join(docsDir, '设计文档.md'), content: '# 设计文档\n\n## 架构\n- 前端 React\n- 后端 Node\n', mtimeOffsetMs: -1 * 24 * 60 * 60 * 1000 },
  { path: path.join(notes2024Dir, '周报-01.md'), content: '# 周报 第1周\n\n## 完成项\n- 需求评审\n', mtimeOffsetMs: -12 * 60 * 60 * 1000 },
  { path: path.join(notes2024Dir, '周报-02.md'), content: '# 周报 第2周\n\n## 完成项\n- 接口设计\n- 数据库表设计\n', mtimeOffsetMs: 0 }
];

const baseTime = Date.now();
for (const f of nestedFiles) {
  fs.writeFileSync(f.path, f.content, 'utf8');
  const mtime = new Date(baseTime + f.mtimeOffsetMs);
  fs.utimesSync(f.path, mtime, mtime);
}

const rootMtimes = [
  { name: '读书笔记.md', offsetMs: -7 * 24 * 60 * 60 * 1000 },
  { name: '会议纪要.md', offsetMs: -5 * 24 * 60 * 60 * 1000 },
  { name: '项目计划.md', offsetMs: -3 * 24 * 60 * 60 * 1000 }
];
for (const r of rootMtimes) {
  const p = path.join(testWorkspacePath, r.name);
  const t = new Date(baseTime + r.offsetMs);
  fs.utimesSync(p, t, t);
}

console.log('test-workspace 已填充：根目录 3 个 md + docs/ + notes/2024/，共 7 个文件。');
console.log('请用 VS Code/Cursor 打开文件夹：', testWorkspacePath);
