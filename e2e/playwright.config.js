"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const path = __importStar(require("path"));
/**
 * Playwright E2E 测试配置
 *
 * 注意：VS Code 扩展的 E2E 测试需要特殊配置
 * 因为 VS Code 是一个 Electron 应用
 */
exports.default = (0, test_1.defineConfig)({
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
//# sourceMappingURL=playwright.config.js.map