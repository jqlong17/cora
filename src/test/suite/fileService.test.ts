import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { FileService } from '../../services/fileService';
import { ConfigService } from '../../services/configService';

suite('FileService Test Suite', () => {
    let configService: ConfigService;
    let fileService: FileService;

    suiteSetup(() => {
        configService = new ConfigService();
        fileService = new FileService(configService);
    });

    test('getChildren returns array with dirs first then files, sorted by config', async function () {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            this.skip();
            return;
        }
        const rootUri = folders[0].uri;
        const rootItem = { uri: rootUri, type: 'directory' as const, name: folders[0].name };
        const items = await fileService.getChildren(rootItem);
        assert.ok(Array.isArray(items), 'getChildren should return array');
        const dirs = items.filter(i => i.type === 'directory');
        const files = items.filter(i => i.type === 'file');
        assert.ok(dirs.length + files.length === items.length, 'All items should be dir or file');
        if (dirs.length > 0 && files.length > 0) {
            const maxDirIdx = Math.max(...dirs.map(d => items.indexOf(d)));
            const minFileIdx = Math.min(...files.map(f => items.indexOf(f)));
            assert.ok(maxDirIdx < minFileIdx, 'Dirs should come before files');
        }
        assert.ok(!items.some(i => i.name === '.git'), 'getChildren should not include .git');
    });

    test('getAllFilesSortedByConfig returns FileItem array and caches result', async function () {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            this.skip();
            return;
        }
        const first = await fileService.getAllFilesSortedByConfig();
        assert.ok(Array.isArray(first), 'getAllFilesSortedByConfig should return array');
        assert.ok(first.every(i => i.type === 'file' && i.uri && i.name), 'Each item should be file with uri and name');
        const second = await fileService.getAllFilesSortedByConfig();
        assert.strictEqual(second.length, first.length, 'Second call within TTL should return same length (cache hit)');
    });

    test('clearFlatListCache forces fresh result and new file appears', async function () {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            this.skip();
            return;
        }
        const uniqueName = `flat-cache-test-${Date.now()}.md`;
        const parentUri = folders[0].uri;
        const created = await fileService.createFile(parentUri, uniqueName);
        if (!created) {
            this.skip();
            return;
        }
        try {
            fileService.clearFlatListCache();
            const after = await fileService.getAllFilesSortedByConfig();
            const found = after.some(i => i.name === uniqueName);
            assert.ok(found, 'After clearFlatListCache and createFile, getAllFilesSortedByConfig should include new file');
        } finally {
            await fileService.deleteItem(created);
        }
    });

    test('getAllFilesSortedByConfig with filterMarkdownOnly returns only markdown files', async function () {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            this.skip();
            return;
        }
        fileService.clearFlatListCache();
        const mdOnly = await fileService.getAllFilesSortedByConfig({ filterMarkdownOnly: true });
        const mdExtensions = ['.md', '.markdown', '.mdx', '.mdc'];
        for (const item of mdOnly) {
            const ext = path.extname(item.name).toLowerCase();
            assert.ok(mdExtensions.includes(ext), `filterMarkdownOnly: every file should have extension in ${mdExtensions.join(',')}, got ${item.name}`);
        }
    });

    test('getAllFilesSortedByConfig does not include files under .git', async function () {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            this.skip();
            return;
        }
        const all = await fileService.getAllFilesSortedByConfig();
        const underGit = all.filter(i => i.uri.fsPath.includes(path.sep + '.git' + path.sep) || i.uri.fsPath.endsWith(path.sep + '.git'));
        assert.strictEqual(underGit.length, 0, 'Flat list should not include any path under .git');
    });

    test('showHiddenFiles controls visibility of dotfiles in flat list', async function () {
        const folders = fileService.getWorkspaceFolders();
        if (folders.length === 0) {
            this.skip();
            return;
        }

        const workspaceConfig = vscode.workspace.getConfiguration('knowledgeBase');
        const originalShowHidden = workspaceConfig.get<boolean>('showHiddenFiles');
        const originalFilterMode = workspaceConfig.get<string>('filterMode');
        const hiddenName = `.hidden-flat-test-${Date.now()}.md`;
        const hiddenUri = await fileService.createFile(folders[0].uri, hiddenName);
        if (!hiddenUri) {
            this.skip();
            return;
        }

        try {
            await workspaceConfig.update('filterMode', 'all', true);
            await workspaceConfig.update('showHiddenFiles', false, true);
            configService.reload();
            fileService.clearFlatListCache();
            const hiddenOff = await fileService.getAllFilesSortedByConfig();
            assert.ok(!hiddenOff.some(i => i.name === hiddenName), 'Hidden file should be excluded when showHiddenFiles is false');

            await workspaceConfig.update('showHiddenFiles', true, true);
            configService.reload();
            fileService.clearFlatListCache();
            const hiddenOn = await fileService.getAllFilesSortedByConfig();
            assert.ok(hiddenOn.some(i => i.name === hiddenName), 'Hidden file should be included when showHiddenFiles is true');
        } finally {
            await fileService.deleteItem(hiddenUri);
            await workspaceConfig.update('showHiddenFiles', originalShowHidden, true);
            await workspaceConfig.update('filterMode', originalFilterMode, true);
            configService.reload();
            fileService.clearFlatListCache();
        }
    });
});
