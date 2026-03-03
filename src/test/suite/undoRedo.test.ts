import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

suite('Undo/Redo & EditorAssociations Test Suite', () => {
    const extensionRoot = path.resolve(__dirname, '../../..');

    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension('jqlong.cora');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    suite('prosemirror-history bundle', () => {
        test('prosemirror-history.bundle.js exists and is non-empty', () => {
            const bundlePath = path.join(extensionRoot, 'media', 'prosemirror-history.bundle.js');
            assert.ok(fs.existsSync(bundlePath), 'prosemirror-history.bundle.js should exist');
            const stat = fs.statSync(bundlePath);
            assert.ok(stat.size > 100, 'Bundle should be non-trivially sized');
        });

        test('bundle exports history, undo, redo symbols', () => {
            const bundlePath = path.join(extensionRoot, 'media', 'prosemirror-history.bundle.js');
            const content = fs.readFileSync(bundlePath, 'utf8');
            assert.ok(content.includes('history'), 'Bundle should export history');
            assert.ok(content.includes('undo'), 'Bundle should export undo');
            assert.ok(content.includes('redo'), 'Bundle should export redo');
        });
    });

    suite('package.json command registration', () => {
        let packageJson: {
            contributes: {
                commands: Array<{ command: string }>;
                keybindings: Array<{ command: string; when: string }>;
                menus: { 'editor/title': Array<{ command: string; when: string }> };
            };
        };

        suiteSetup(() => {
            const raw = fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8');
            packageJson = JSON.parse(raw);
        });

        test('knowledgeBase.undo command is declared', () => {
            const found = packageJson.contributes.commands.some(c => c.command === 'knowledgeBase.undo');
            assert.ok(found, 'knowledgeBase.undo should be declared in contributes.commands');
        });

        test('knowledgeBase.redo command is declared', () => {
            const found = packageJson.contributes.commands.some(c => c.command === 'knowledgeBase.redo');
            assert.ok(found, 'knowledgeBase.redo should be declared in contributes.commands');
        });

        test('undo keybinding supports both coraPreview and cora.markdown.preview', () => {
            const binding = packageJson.contributes.keybindings.find(k => k.command === 'knowledgeBase.undo');
            assert.ok(binding, 'undo keybinding should exist');
            assert.ok(binding!.when.includes('coraPreview'), 'when should include coraPreview');
            assert.ok(binding!.when.includes('cora.markdown.preview'), 'when should include cora.markdown.preview');
        });

        test('redo keybinding supports both coraPreview and cora.markdown.preview', () => {
            const binding = packageJson.contributes.keybindings.find(k => k.command === 'knowledgeBase.redo');
            assert.ok(binding, 'redo keybinding should exist');
            assert.ok(binding!.when.includes('coraPreview'), 'when should include coraPreview');
            assert.ok(binding!.when.includes('cora.markdown.preview'), 'when should include cora.markdown.preview');
        });

        test('undo menu entry supports both editor types', () => {
            const entry = packageJson.contributes.menus['editor/title'].find(
                m => m.command === 'knowledgeBase.undo'
            );
            assert.ok(entry, 'undo menu entry should exist');
            assert.ok(entry!.when.includes('coraPreview'), 'menu when should include coraPreview');
            assert.ok(entry!.when.includes('cora.markdown.preview'), 'menu when should include cora.markdown.preview');
        });

        test('redo menu entry supports both editor types', () => {
            const entry = packageJson.contributes.menus['editor/title'].find(
                m => m.command === 'knowledgeBase.redo'
            );
            assert.ok(entry, 'redo menu entry should exist');
            assert.ok(entry!.when.includes('coraPreview'), 'menu when should include coraPreview');
            assert.ok(entry!.when.includes('cora.markdown.preview'), 'menu when should include cora.markdown.preview');
        });
    });

    suite('editorAssociations policy', () => {
        test('syncEditorAssociationsForPreviewOnClick cleans Cora associations from editorAssociations', async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const cfg = vscode.workspace.getConfiguration('workbench');
            const current = cfg.get<Record<string, string>>('editorAssociations') ?? {};
            const val = current['*.md'];
            assert.ok(
                val !== 'cora.markdown.preview',
                `After extension activation, *.md should NOT be associated with cora.markdown.preview (got: ${val})`
            );
        });

        test('no auto-replace listener for arbitrary .md opens', async function() {
            this.timeout(5000);
            const testWorkspacePath = path.resolve(__dirname, '../../../test-workspace');
            const testFile = path.join(testWorkspacePath, '项目计划.md');
            if (!fs.existsSync(testFile)) {
                return;
            }

            const doc = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(doc);
            await new Promise(resolve => setTimeout(resolve, 800));

            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor, 'Opening .md via API should stay as text editor, not be replaced by Cora preview');
            assert.ok(
                activeEditor!.document.uri.fsPath === testFile,
                'Active editor should show the same file opened'
            );

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('undo/redo commands registered at runtime', () => {
        test('knowledgeBase.undo command is registered and callable', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('knowledgeBase.undo'), 'knowledgeBase.undo should be registered');
        });

        test('knowledgeBase.redo command is registered and callable', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('knowledgeBase.redo'), 'knowledgeBase.redo should be registered');
        });

        test('executing undo/redo commands does not throw without an active Cora panel', async () => {
            await assert.doesNotReject(
                async () => { await vscode.commands.executeCommand('knowledgeBase.undo'); },
                'undo should not throw when no Cora panel is active'
            );
            await assert.doesNotReject(
                async () => { await vscode.commands.executeCommand('knowledgeBase.redo'); },
                'redo should not throw when no Cora panel is active'
            );
        });
    });

    suite('NLS localization', () => {
        test('package.nls.json contains cmd.undo and cmd.redo', () => {
            const nls = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.nls.json'), 'utf8'));
            assert.ok(nls['cmd.undo'], 'package.nls.json should have cmd.undo');
            assert.ok(nls['cmd.redo'], 'package.nls.json should have cmd.redo');
        });

        test('package.nls.zh-cn.json contains cmd.undo and cmd.redo', () => {
            const nls = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.nls.zh-cn.json'), 'utf8'));
            assert.ok(nls['cmd.undo'], 'package.nls.zh-cn.json should have cmd.undo');
            assert.ok(nls['cmd.redo'], 'package.nls.zh-cn.json should have cmd.redo');
        });
    });
});
