# Cora E2E 测试

本目录包含使用 Playwright 进行真实 UI 自动化测试的方案。

## 方案对比

| 测试类型 | 工具 | 适用场景 | 优点 | 缺点 |
|---------|------|---------|------|------|
| 集成测试 | @vscode/test-electron | 测试扩展 API | 速度快，无需真实 UI | 无法测试 UI 交互 |
| UI E2E | Playwright | 测试完整用户流程 | 真实用户操作，覆盖全面 | 速度慢，需要配置 |

## 快速开始

### 方案 1：VS Code 集成测试（推荐）

已经在 `src/test/suite/e2e.test.ts` 中实现，运行方式：

```bash
npm test
```

### 方案 2：Playwright UI 测试

如果你需要测试真实的 UI 交互（点击按钮、输入文本等），可以使用 Playwright。

#### 安装依赖

```bash
cd e2e
npm install
```

#### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npx playwright test --grep "搜索功能"

# 可视化模式（可以看到浏览器操作）
npx playwright test --headed
```

#### 调试测试

```bash
# 逐步调试
npx playwright test --debug

# 录制测试视频
npx playwright test --video
```

## 测试覆盖范围

### 已实现

- [x] 扩展激活测试
- [x] 页面树显示测试
- [x] 大纲提取测试
- [x] 命令可用性测试
- [x] 配置测试

### 建议添加

- [ ] 文件创建/删除测试
- [ ] 搜索功能完整流程测试
- [ ] 编辑/预览切换测试
- [ ] 大纲跳转测试
- [ ] 右键菜单功能测试

## 编写新测试

参考 `tests/basic.spec.ts` 的示例，测试基本结构：

```typescript
import { test, expect } from '@playwright/test';

test('描述测试的功能', async ({ page }) => {
  // 1. 打开 VS Code
  await page.goto('vscode://');

  // 2. 执行操作
  await page.click('[aria-label="Cora"]');

  // 3. 验证结果
  await expect(page.locator('.tree-view')).toBeVisible();
});
```

## 常见问题

### Q: 测试找不到 VS Code？
A: 确保 `playwright.config.ts` 中的 `executablePath` 指向正确的 VS Code/Cursor 路径。

### Q: 测试运行很慢？
A: UI 测试本来就慢，建议：
1. 只在关键流程使用 UI 测试
2. 其他测试使用集成测试
3. 使用并行测试 `workers: 4`

### Q: 如何只测试特定功能？
A: 使用 `grep` 参数：
```bash
npx playwright test --grep "大纲"
```
