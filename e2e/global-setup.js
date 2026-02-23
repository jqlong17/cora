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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * 全局设置：在测试前启动 VS Code
 */
async function globalSetup() {
    console.log('Starting VS Code for E2E tests...');
    // 创建测试工作区
    const testWorkspace = path.join(__dirname, 'test-workspace');
    if (!fs.existsSync(testWorkspace)) {
        fs.mkdirSync(testWorkspace, { recursive: true });
        // 创建测试文件
        fs.writeFileSync(path.join(testWorkspace, 'README.md'), '# Test Workspace\n\nThis is a test file for E2E tests.\n', 'utf8');
        fs.writeFileSync(path.join(testWorkspace, '项目文档.md'), `# 项目文档

## 项目计划
这是一个测试项目。

## 技术方案
使用 TypeScript 开发。

## 需求分析
- 功能1：文件管理
- 功能2：大纲视图
- 功能3：全文搜索
`, 'utf8');
    }
    // 检测操作系统并找到 VS Code 路径
    const vscodePath = getVSCodePath();
    console.log('VS Code path:', vscodePath);
    // 启动 VS Code（带调试端口）
    // 注意：实际运行时需要确保端口未被占用
    const extensionPath = path.join(__dirname, '..');
    console.log('Extension path:', extensionPath);
    console.log('Test workspace:', testWorkspace);
    // 将路径写入环境变量供测试使用
    process.env.VSCODE_PATH = vscodePath;
    process.env.TEST_WORKSPACE = testWorkspace;
    process.env.EXTENSION_PATH = extensionPath;
    console.log('Global setup completed');
}
function getVSCodePath() {
    const platform = process.platform;
    if (platform === 'darwin') {
        // macOS - 优先使用 Cursor
        const cursorPath = '/Applications/Cursor.app/Contents/MacOS/Cursor';
        const vscodePath = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
        if (require('fs').existsSync(cursorPath)) {
            return cursorPath;
        }
        if (require('fs').existsSync(vscodePath)) {
            return vscodePath;
        }
    }
    else if (platform === 'win32') {
        // Windows
        return 'code';
    }
    else {
        // Linux
        return 'code';
    }
    // 默认使用命令
    return 'code';
}
exports.default = globalSetup;
//# sourceMappingURL=global-setup.js.map