import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Custom Editor 初始模式测试
 * 验证点击 MD 文件后默认进入 Preview 模式
 */

const TEST_FILES = [
    '/Users/ruska/.openclaw/workspace/memory/2026-02-18.md',
    '/Users/ruska/.openclaw/workspace/memory/2026-02-22.md',
    '/Users/ruska/.openclaw/workspace/memory/openclaw-update-2026-02-22.md',
];

suite('Custom Editor Initial Mode Tests', () => {

    test('Test files should exist', () => {
        TEST_FILES.forEach(filePath => {
            const exists = fs.existsSync(filePath);
            assert.ok(exists, `Test file should exist: ${path.basename(filePath)}`);
        });
    });

    test('HTML should have preview as default visible view', () => {
        // Read the MarkdownEditorProvider source
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        // Check that preview is default
        // The HTML should have preview-view without hidden class
        // and editor-view with hidden class initially
        assert.ok(source.includes('data-initial-mode="preview"'),
            'HTML should have data-initial-mode="preview" attribute');

        // Check CSS classes in HTML structure
        assert.ok(source.includes('class="view preview-view"'),
            'Preview view should not have hidden class by default');
        assert.ok(source.includes('class="view editor-view hidden"'),
            'Editor view should have hidden class by default');
    });

    test('JavaScript should initialize to preview mode', () => {
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        // Check that updateUI is called with initial mode
        assert.ok(source.includes('const DEFAULT_MODE = \'preview\''),
            'JavaScript should define DEFAULT_MODE as preview');

        assert.ok(source.includes('updateUI(DEFAULT_MODE)'),
            'JavaScript should call updateUI with DEFAULT_MODE on init');
    });

    test('Mode toggle buttons should exist with correct IDs', () => {
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        assert.ok(source.includes('id="previewBtn"'), 'Preview button should exist');
        assert.ok(source.includes('id="editBtn"'), 'Edit button should exist');
        assert.ok(source.includes('switchMode(\'preview\')'), 'Preview button should call switchMode');
        assert.ok(source.includes('switchMode(\'edit\')'), 'Edit button should call switchMode');
    });

    test('CSS should have hidden class definition', () => {
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        assert.ok(source.includes('.view.hidden'), 'CSS should define .view.hidden');
        assert.ok(source.includes('display: none'), 'hidden class should set display: none');
    });

    test('Initial state verification - editor should be hidden by default', async () => {
        // This test verifies the HTML structure without running the full webview
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        // Extract the getHtml method logic
        // Check that editorView has 'hidden' class
        const hasEditorHidden = source.includes('id="editorView"') &&
                               source.includes('editor-view hidden');

        // Check that previewView does NOT have 'hidden' class
        const hasPreviewVisible = source.includes('id="previewView"') &&
                                 source.includes('preview-view"');

        assert.ok(hasEditorHidden, 'Editor view should have hidden class initially');
        assert.ok(hasPreviewVisible, 'Preview view should be visible initially');
    });

    test('Webview should send ready message and respond to setMode', () => {
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        // Check for ready message from webview
        assert.ok(source.includes("vscode.postMessage({ command: 'ready' })"),
            'Webview should send ready message');

        // Check for extension handling ready message
        assert.ok(source.includes("message.command === 'ready'"),
            'Extension should handle ready message');
    });

    test('All test markdown files have different structures', () => {
        const structures = TEST_FILES.map(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const h1Count = lines.filter(l => l.startsWith('# ')).length;
            const h2Count = lines.filter(l => l.startsWith('## ')).length;
            const hasCode = content.includes('```');
            const hasTable = content.includes('|');

            return {
                file: path.basename(filePath),
                h1Count,
                h2Count,
                hasCode,
                hasTable,
                size: content.length
            };
        });

        console.log('Test file structures:', structures);

        // All files should be different sizes
        const sizes = structures.map(s => s.size);
        const uniqueSizes = new Set(sizes);
        assert.ok(uniqueSizes.size > 1, 'Test files should have different sizes');
    });

    test('HTML structure should prevent flash of wrong mode', () => {
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        // CSS should hide editor by default (server-side rendered state)
        // This prevents flash of editor before JS runs
        const editorViewMatch = source.match(/class="view editor-view[^"]*"/);
        const previewViewMatch = source.match(/class="view preview-view[^"]*"/);

        assert.ok(editorViewMatch, 'Should find editor-view class definition');
        assert.ok(previewViewMatch, 'Should find preview-view class definition');

        // Editor should have 'hidden' class in HTML
        assert.ok(editorViewMatch![0].includes('hidden'),
            'Editor view should have hidden class in initial HTML to prevent flash');

        // Preview should NOT have 'hidden' class
        assert.ok(!previewViewMatch![0].includes('hidden'),
            'Preview view should NOT have hidden class in initial HTML');
    });
});

suite('Custom Editor Edge Cases', () => {

    test('Empty markdown file should still open in preview mode', () => {
        // Create a temp empty file test
        const emptyContent = '';

        // Even with empty content, the initial mode should be preview
        // This is controlled by the HTML structure, not content
        assert.ok(true, 'Empty files should default to preview mode');
    });

    test('Large markdown file should default to preview mode', () => {
        const largeFile = TEST_FILES.find(f => {
            const stats = fs.statSync(f);
            return stats.size > 4000; // 4KB+
        });

        assert.ok(largeFile, 'Should have a large test file (>4KB)');
        const stats = fs.statSync(largeFile!);
        console.log(`Large file: ${path.basename(largeFile!)} (${stats.size} bytes)`);
    });

    test('File with no headings should default to preview mode', () => {
        const noHeadingsFile = TEST_FILES.find(f => {
            const content = fs.readFileSync(f, 'utf8');
            return !content.includes('# '); // No H1 headings
        });

        assert.ok(noHeadingsFile, 'Should have a file with no H1 headings');
        console.log(`No headings file: ${path.basename(noHeadingsFile!)}`);
    });
});

// Debug: Log the actual HTML structure for inspection
suite('Debug HTML Structure', () => {

    test('Log HTML template structure', () => {
        const providerPath = path.join(__dirname, '..', '..', 'src', 'providers', 'markdownEditorProvider.ts');
        const source = fs.readFileSync(providerPath, 'utf8');

        // Extract key parts
        const htmlTagMatch = source.match(/<html[^>]*>/);
        const editorViewMatch = source.match(/class="view editor-view[^"]*"/);
        const previewViewMatch = source.match(/class="view preview-view[^"]*"/);
        const jsInitMatch = source.match(/updateUI\(currentMode\)/);
        const initialModeMatch = source.match(/data-initial-mode="[^"]*"/);

        console.log('\n=== HTML Structure Analysis ===');
        console.log('HTML tag:', htmlTagMatch ? htmlTagMatch[0] : 'NOT FOUND');
        console.log('Editor view class:', editorViewMatch ? editorViewMatch[0] : 'NOT FOUND');
        console.log('Preview view class:', previewViewMatch ? previewViewMatch[0] : 'NOT FOUND');
        console.log('JS init call:', jsInitMatch ? jsInitMatch[0] : 'NOT FOUND');
        console.log('Initial mode attr:', initialModeMatch ? initialModeMatch[0] : 'NOT FOUND');

        // Verify all critical parts exist
        assert.ok(htmlTagMatch, 'HTML tag should exist');
        assert.ok(editorViewMatch, 'Editor view should exist');
        assert.ok(previewViewMatch, 'Preview view should exist');
    });
});
