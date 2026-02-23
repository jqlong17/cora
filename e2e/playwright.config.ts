import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Playwright E2E 测试配置
 *
 * 注意：VS Code 扩展的 E2E 测试需要特殊配置
 * 因为 VS Code 是一个 Electron 应用
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // VS Code 单实例，不能并行
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // VS Code 只能单 worker
  reporter: 'list',
  timeout: 60000, // 60 秒超时

  use: {
    // 连接到已运行的 VS Code（通过调试端口）
    // 或者启动新的 VS Code 实例
    headless: false, // VS Code 需要可视化
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'vscode',
      use: {
        // 这里可以配置 VS Code 特定的设置
      },
    },
  ],

  // 全局设置：启动 VS Code
  globalSetup: path.join(__dirname, './global-setup.ts'),
  globalTeardown: path.join(__dirname, './global-teardown.ts'),
});
