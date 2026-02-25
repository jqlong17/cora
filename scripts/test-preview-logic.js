const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Mock vscode module purely
const mockVscode = {
    Uri: {
        file: (p) => ({ fsPath: p, path: p, toString: () => `file://${p}` }),
        joinPath: (uri, ...parts) => ({ fsPath: path.join(uri.fsPath, ...parts), path: path.join(uri.path, ...parts) })
    },
    window: {
        createWebviewPanel: () => ({
            webview: {
                onDidReceiveMessage: (cb) => { global.onMsg = cb; },
                asWebviewUri: (uri) => uri,
                html: ''
            },
            onDidDispose: () => { }
        })
    },
    workspace: {
        fs: {
            writeFile: async (uri, content) => {
                global.lastWrite = { uri: uri.fsPath, content: Buffer.from(content).toString() };
            }
        }
    },
    ViewColumn: { One: 1 }
};

// Manually define vscode in require.cache
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalLoad.apply(this, arguments);
};

// 2. Import PreviewProvider from out/
const { PreviewProvider } = require('../out/providers/previewProvider.js');

async function runTest() {
    console.log('--- 开始 PreviewProvider 逻辑单元测试 ---');

    const context = { extensionUri: mockVscode.Uri.file('/mock/extension') };
    const provider = new PreviewProvider(context);

    // 模拟 fs.promises.readFile
    const originalReadFile = fs.promises.readFile;
    fs.promises.readFile = async () => 'initial content';

    const testUri = mockVscode.Uri.file('/mock/test.md');

    console.log('1. 测试生成 HTML...');
    const html = provider.generateHtml('test md', testUri, mockVscode.window.createWebviewPanel().webview);
    assert.ok(html.includes('id="editor"'), 'HTML 应该包含编辑容器');
    assert.ok(html.includes('editor.js'), 'HTML 应该包含脚本引用');

    console.log('2. 测试消息监听与防抖保存...');
    await provider.openPreview(testUri);

    const newDocContent = '# New Content';
    // 模拟 Webview 发回消息
    await global.onMsg({ command: 'editorUpdate', content: newDocContent });

    console.log('   等待防抖时间 (900ms)...');
    await new Promise(r => setTimeout(r, 900));

    assert.ok(global.lastWrite, '检测到磁盘写入');
    assert.strictEqual(global.lastWrite.content, newDocContent, '写入内容匹配');
    assert.strictEqual(global.lastWrite.uri, '/mock/test.md', '写入路径匹配');

    console.log('✅ 逻辑测试全部通过！');
    fs.promises.readFile = originalReadFile;
}

runTest().catch(err => {
    console.error('❌ 测试运行失败:', err);
    process.exit(1);
});
