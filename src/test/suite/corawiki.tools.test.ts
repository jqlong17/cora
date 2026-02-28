import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { checkPythonAvailable, readFullCode, runPythonTool } from '../../corawiki/tools';

suite('CoraWiki tools Test Suite', () => {
    test('readFullCode should limit default output for large file', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corawiki-tools-'));
        const filePath = path.join(tempRoot, 'big.ts');
        const content = Array.from({ length: 500 }, (_, i) => `line-${i + 1}`).join('\n');
        await fs.writeFile(filePath, content, 'utf8');
        try {
            const result = await readFullCode(filePath);
            assert.ok(result.includes('line-1'));
            assert.ok(result.includes('line-500'));
            assert.ok(result.includes('[omitted'));
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('runPythonTool returns error when extensionPath is empty', async () => {
        const res = await runPythonTool('', 'python3', 'extract_import_graph', { filePaths: [], workspacePath: os.tmpdir() }, os.tmpdir());
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
            assert.ok(res.error.includes('extensionPath') || res.error.includes('not available'));
        }
    });

    test('runPythonTool returns error when runner.py does not exist', async () => {
        const res = await runPythonTool(os.tmpdir(), 'python3', 'extract_import_graph', { filePaths: [], workspacePath: os.tmpdir() }, os.tmpdir());
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
            assert.ok(res.error.includes('runner') || res.error.includes('not found'));
        }
    });

    test('runPythonTool extract_import_graph with real runner (when available)', async function () {
        const projectRoot = path.join(__dirname, '..', '..', '..');
        const runnerPath = path.join(projectRoot, 'corawiki-pytools', 'runner.py');
        try {
            await fs.access(runnerPath);
        } catch {
            this.skip();
        }
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corawiki-pytools-'));
        const pyFile = path.join(tempRoot, 'sample.py');
        await fs.writeFile(pyFile, 'import os\nfrom pathlib import Path\n', 'utf8');
        try {
            const res = await runPythonTool(projectRoot, 'python3', 'extract_import_graph', {
                filePaths: [pyFile],
                workspacePath: tempRoot
            }, tempRoot);
            if (!res.ok) {
                if (res.error.includes('Failed to start Python') || res.error.includes('python3')) {
                    this.skip();
                }
                throw new Error(res.error);
            }
            assert.strictEqual(res.ok, true);
            const result = res.result as Array<{ filePath: string; imports: string[]; localDeps: string[]; externalDeps: string[] }>;
            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 1);
            assert.ok(result[0].filePath.endsWith('sample.py'));
            assert.ok(Array.isArray(result[0].imports));
            assert.ok(Array.isArray(result[0].externalDeps));
            assert.ok(result[0].imports.includes('os') || result[0].imports.includes('pathlib'));
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('checkPythonAvailable returns error when extensionPath is empty', async () => {
        const res = await checkPythonAvailable('', 'python3');
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
            assert.ok(res.error.includes('extensionPath') || res.error.includes('not set'));
        }
    });

    test('checkPythonAvailable returns error when runner.py does not exist', async () => {
        const res = await checkPythonAvailable(os.tmpdir(), 'python3');
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
            assert.ok(res.error.includes('runner') || res.error.includes('not found'));
        }
    });

    test('checkPythonAvailable returns ok when runner exists and python runs (when available)', async function () {
        const projectRoot = path.join(__dirname, '..', '..', '..');
        const runnerPath = path.join(projectRoot, 'corawiki-pytools', 'runner.py');
        try {
            await fs.access(runnerPath);
        } catch {
            this.skip();
        }
        const res = await checkPythonAvailable(projectRoot, 'python3');
        if (!res.ok && res.error.includes('not runnable')) {
            this.skip();
        }
        assert.strictEqual(res.ok, true);
    });
});

