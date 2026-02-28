import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResearchController } from '../../corawiki/researchController';

suite('CoraWiki ResearchController Test Suite', () => {
    test('run should produce plan/update/final steps', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-'));
        const srcDir = path.join(tempRoot, 'src');
        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(
            path.join(srcDir, 'sample.ts'),
            'import * as path from "path";\nexport function hello(){ return path.basename("a"); }\n',
            'utf8'
        );

        try {
            const controller = new ResearchController({ maxSteps: 4 });
            const result = await controller.run('分析 sample.ts 的职责', tempRoot);

            assert.ok(result.plan.length > 0, 'plan should not be empty');
            assert.ok(result.finalConclusion.length > 0, 'finalConclusion should not be empty');
            assert.ok(result.steps.length >= 2, 'should have at least PLAN and FINAL');
            assert.strictEqual(result.steps[0].stage, 'PLAN');
            assert.strictEqual(result.steps[result.steps.length - 1].stage, 'FINAL');
            if (result.debugLogPath) {
                assert.ok(result.debugLogPath.endsWith('.txt'), 'debug log should be .txt when present');
                const logContent = await fs.readFile(result.debugLogPath, 'utf8').catch(() => '');
                assert.ok(logContent.includes('## '), 'log should contain section headers');
                assert.ok(logContent.includes('## 第 1 轮 决策'), 'log should contain decision block for iteration 1');
            }
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('run should emit progress messages', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-progress-'));
        const srcDir = path.join(tempRoot, 'src');
        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(
            path.join(srcDir, 'sample.ts'),
            'export const value = 1;\n',
            'utf8'
        );

        const progressMessages: string[] = [];
        try {
            const controller = new ResearchController({
                maxSteps: 3,
                onProgress: (message: string) => progressMessages.push(message)
            });
            await controller.run('分析 sample.ts', tempRoot);

            assert.ok(progressMessages.length > 0, 'progress should be emitted');
            assert.ok(progressMessages.some(msg => msg.includes('正在')), 'should include human-readable running status');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('executeTool should block guessed file path until discovered by list_dir', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-guard-'));
        const srcDir = path.join(tempRoot, 'src');
        const filePath = path.join(srcDir, 'sample.ts');
        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(filePath, 'export const hello = "world";\n', 'utf8');

        try {
            const controller = new ResearchController({ maxSteps: 2 });
            const discoveredFiles = new Set<string>();
            const discoveredDirs = new Set<string>([tempRoot]);

            const blocked = await (controller as any).executeTool(
                'read_skeleton',
                { filePath },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            assert.ok(String(blocked.contextOutput).includes('path_guard_blocked'), 'should block unknown file path');
            assert.strictEqual(blocked.evidence.length, 0);

            await (controller as any).executeTool(
                'list_dir',
                { targetPath: srcDir },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            const allowed = await (controller as any).executeTool(
                'read_skeleton',
                { filePath },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            assert.ok(!String(allowed.contextOutput).includes('path_guard_blocked'), 'should allow discovered file');
            assert.ok(allowed.evidence.length > 0, 'should return evidence after discovery');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('normalizeMermaidDiagrams should extract fenced mermaid blocks', () => {
        const controller = new ResearchController();
        const normalized = (controller as any).normalizeMermaidDiagrams([
            '```mermaid\nflowchart TD\nA-->B\n```',
            'Architecture: this is plain text'
        ]) as string[];
        assert.ok(normalized.some(item => item.startsWith('flowchart TD')), 'should keep valid mermaid block');
        assert.ok(!normalized.some(item => item.includes('Architecture:')), 'should drop plain-text diagram description');
    });

    test('ensureMinimumDiagrams should provide fallback diagrams', () => {
        const controller = new ResearchController();
        const diagrams = (controller as any).ensureMinimumDiagrams([]) as string[];
        assert.ok(diagrams.length >= 2, 'should provide at least two diagrams');
        assert.ok(diagrams[0].startsWith('flowchart '), 'fallback should be mermaid flowchart');
    });

    test('checkFinalQuality passes when diagrams come from ensureMinimumDiagrams([])', () => {
        const controller = new ResearchController();
        const minimalPass = {
            architectureFindings: [
                { title: 'A', judgement: 'judgement a', evidence: ['src/a.ts:1'] },
                { title: 'B', judgement: 'judgement b', evidence: ['src/b.ts:1'] },
                { title: 'C', judgement: 'judgement c', evidence: ['src/c.ts:1'] }
            ],
            criticalFlows: [{ name: 'flow', steps: ['a', 'b'], evidence: ['src/a.ts:1'] }],
            references: ['src/a.ts:1', 'src/b.ts:1', 'src/c.ts:1', 'src/d.ts:1', 'src/e.ts:1'],
            risks: [{ risk: 'r1', impact: 'high', evidence: ['src/a.ts:1'] }],
            unknowns: ['u1'],
            moduleSummaries: ['mod a']
        };
        const diagrams = (controller as any).ensureMinimumDiagrams([]) as string[];
        const quality = (controller as any).checkFinalQuality({
            ...minimalPass,
            diagrams
        }) as { ok: boolean; reason?: string };
        assert.strictEqual(quality.ok, true, 'quality gate should pass when diagrams are from ensureMinimumDiagrams([])');
    });

    test('checkFinalQuality passes when diagrams come from ensureMinimumDiagrams with 2 valid mermaid', () => {
        const controller = new ResearchController();
        const minimalPass = {
            architectureFindings: [
                { title: 'A', judgement: 'judgement a', evidence: ['src/a.ts:1'] },
                { title: 'B', judgement: 'judgement b', evidence: ['src/b.ts:1'] },
                { title: 'C', judgement: 'judgement c', evidence: ['src/c.ts:1'] }
            ],
            criticalFlows: [{ name: 'flow', steps: ['a', 'b'], evidence: ['src/a.ts:1'] }],
            references: ['src/a.ts:1', 'src/b.ts:1', 'src/c.ts:1', 'src/d.ts:1', 'src/e.ts:1'],
            risks: [{ risk: 'r1', impact: 'high', evidence: ['src/a.ts:1'] }],
            unknowns: ['u1'],
            moduleSummaries: ['mod a']
        };
        const diagrams = (controller as any).ensureMinimumDiagrams([
            'flowchart TD\nA-->B',
            'graph TD\nX-->Y'
        ]) as string[];
        const quality = (controller as any).checkFinalQuality({
            ...minimalPass,
            diagrams
        }) as { ok: boolean; reason?: string };
        assert.strictEqual(quality.ok, true, 'quality gate should pass with 2 valid mermaid from ensureMinimumDiagrams');
    });

    test('checkFinalQuality should enforce P0 ratio and reject duplicate findings', () => {
        const controller = new ResearchController();
        const quality = (controller as any).checkFinalQuality({
            architectureFindings: [
                { title: 'A', judgement: 'same judgement', evidence: ['src/a.ts:1'] },
                { title: 'B', judgement: 'same judgement', evidence: ['src/b.ts:1'] },
                { title: 'C', judgement: 'unique', evidence: ['src/c.ts:1'] }
            ],
            criticalFlows: [{ name: 'flow', steps: ['a', 'b'], evidence: ['src/a.ts:1'] }],
            references: ['src/a.ts:1', 'src/b.ts:1', 'docs/README.md', 'docs/ARCH.md', 'docs/EP-1.md'],
            diagrams: ['flowchart TD\nA-->B', 'graph TD\nX-->Y'],
            risks: [{ risk: 'r1', impact: 'high', evidence: ['src/a.ts:1'] }],
            unknowns: ['u1'],
            moduleSummaries: ['mod a']
        }) as { ok: boolean; reason?: string };
        assert.strictEqual(quality.ok, false, 'quality gate should fail');
        assert.ok(quality.reason?.includes('占比') || quality.reason?.includes('重复'));
    });

    test('normalizeReferences should prioritize P0 and trim noisy P2 references', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-ref-'));
        await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
        await fs.mkdir(path.join(tempRoot, 'docs'), { recursive: true });
        await fs.writeFile(path.join(tempRoot, 'src', 'main.ts'), 'export const a = 1;\n', 'utf8');
        await fs.writeFile(path.join(tempRoot, 'package.json'), '{"name":"x"}\n', 'utf8');
        await fs.writeFile(path.join(tempRoot, 'docs', 'README.md'), '# readme\n', 'utf8');
        await fs.writeFile(path.join(tempRoot, 'docs', 'EP-123.md'), '# noisy\n', 'utf8');
        try {
            const controller = new ResearchController();
            const refs = await (controller as any).normalizeReferences(
                ['docs/README.md', 'docs/EP-123.md', 'src/main.ts:1', 'package.json'],
                tempRoot
            );
            assert.ok(refs[0].startsWith('src/'), 'P0 reference should be first');
            assert.ok(!refs.some((item: string) => item.includes('EP-123.md')), 'noisy P2 references should be filtered');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('buildContextMessages should include iteration metadata for model context', () => {
        const controller = new ResearchController({ maxSteps: 10, maxTotalTokens: 1000 });
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'query' }
        ];
        const context = (controller as any).buildContextMessages(messages, ['u1'], ['src/a.ts:1'], 3, 10, 240, 1000) as any[];
        const metaMsg = context.find(
            msg => msg.role === 'system' && String(msg.content).includes('评估元数据：当前轮次=3/10')
        );
        assert.ok(metaMsg, 'context should include iteration/token metadata');
        assert.ok(String(metaMsg.content).includes('当前累计tokens=240'));
        assert.ok(String(metaMsg.content).includes('剩余轮次=7'));
    });

    test('buildContextMessages should include tool catalog and lastRoundToolNames when provided', () => {
        const controller = new ResearchController({ maxSteps: 5, maxTotalTokens: 5000 });
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'query' }
        ];
        const tools = [
            { type: 'function' as const, function: { name: 'list_dir', description: '列出目录下文件与子目录', parameters: {} } },
            { type: 'function' as const, function: { name: 'read_skeleton', description: '读取代码骨架', parameters: {} } }
        ];
        const context = (controller as any).buildContextMessages(
            messages, [], [], 2, 5, 100, 5000, tools, ['list_dir']
        ) as any[];
        const metaMsg = context.find(m => m.role === 'system' && String(m.content).includes('可用工具及说明'));
        assert.ok(metaMsg, 'context should include tool catalog');
        assert.ok(String(metaMsg.content).includes('list_dir=列出目录下文件与子目录'));
        assert.ok(String(metaMsg.content).includes('read_skeleton=读取代码骨架'));
        assert.ok(String(metaMsg.content).includes('上一轮已调用工具'));
        assert.ok(String(metaMsg.content).includes('list_dir（列出目录下文件与子目录）'));
    });

    test('buildContextMessages iteration 1 with no prior tools suggests discover_entrypoints or summarize_directory', () => {
        const controller = new ResearchController({ maxSteps: 10, maxTotalTokens: 1000 });
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'query' }
        ];
        const tools = [
            { type: 'function' as const, function: { name: 'discover_entrypoints', description: '扫描入口', parameters: {} } },
            { type: 'function' as const, function: { name: 'summarize_directory', description: '统计目录', parameters: {} } }
        ];
        const context = (controller as any).buildContextMessages(
            messages, [], [], 1, 10, 0, 1000, tools, []
        ) as any[];
        const metaMsg = context.find(m => m.role === 'system' && String(m.content).includes('评估元数据'));
        assert.ok(metaMsg, 'should have runMeta');
        const content = String(metaMsg.content);
        assert.ok(content.includes('discover_entrypoints') || content.includes('summarize_directory'), 'should suggest discover or summarize in first 2 rounds');
    });

    test('buildContextMessages iteration 3 with only list_dir last round adds no-consecutive-list_dir hint', () => {
        const controller = new ResearchController({ maxSteps: 10, maxTotalTokens: 1000 });
        const messages = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'query' }
        ];
        const tools = [
            { type: 'function' as const, function: { name: 'list_dir', description: '列出目录', parameters: {} } },
            { type: 'function' as const, function: { name: 'read_skeleton', description: '读骨架', parameters: {} } }
        ];
        const context = (controller as any).buildContextMessages(
            messages, [], [], 3, 10, 500, 1000, tools, ['list_dir']
        ) as any[];
        const metaMsg = context.find(m => m.role === 'system' && String(m.content).includes('评估元数据'));
        assert.ok(metaMsg, 'should have runMeta');
        const content = String(metaMsg.content);
        assert.ok(content.includes('禁止连续') || content.includes('read_skeleton'), 'should hint no consecutive list_dir or suggest read_skeleton');
    });

    test('buildContextMessages first round (iteration 1) includes base system and user', () => {
        const controller = new ResearchController({ maxSteps: 10, maxTotalTokens: 1000 });
        const messages = [
            { role: 'system', content: 'long_system_prompt' },
            { role: 'user', content: 'user_query' }
        ];
        const context = (controller as any).buildContextMessages(
            messages, [], [], 1, 10, 0, 1000
        ) as any[];
        assert.strictEqual(context[0].role, 'system');
        assert.strictEqual(context[0].content, 'long_system_prompt');
        assert.strictEqual(context[1].role, 'user');
        assert.strictEqual(context[1].content, 'user_query');
        const runMeta = context.find(m => m.role === 'system' && String(m.content).includes('评估元数据：当前轮次=1/10'));
        assert.ok(runMeta, 'first round should include runMeta');
    });

    test('buildContextMessages subsequent round (iteration 2) omits base, starts with runMeta', () => {
        const controller = new ResearchController({ maxSteps: 10, maxTotalTokens: 1000 });
        const messages = [
            { role: 'system', content: 'long_system_prompt' },
            { role: 'user', content: 'user_query' }
        ];
        const context = (controller as any).buildContextMessages(
            messages, [], [], 2, 10, 500, 1000
        ) as any[];
        assert.ok(context.length >= 1, 'subsequent round should have at least runMeta');
        assert.strictEqual(context[0].role, 'system');
        assert.ok(String(context[0].content).includes('评估元数据：当前轮次=2/10'));
        assert.ok(!context.some(m => m.content === 'long_system_prompt'), 'should not include original system');
        assert.ok(!context.some(m => m.content === 'user_query'), 'should not include original user');
    });

    test('executeTool extract_import_graph returns python_tool_unavailable when enablePythonTooling false', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-py-off-'));
        try {
            const controller = new ResearchController({ enablePythonTooling: false, extensionPath: tempRoot });
            const discoveredFiles = new Set<string>();
            const discoveredDirs = new Set<string>([tempRoot]);
            const result = await (controller as any).executeTool(
                'extract_import_graph',
                { filePaths: [], workspacePath: tempRoot },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            assert.ok(String(result.contextOutput).includes('python_tool_unavailable'));
            assert.strictEqual(result.evidence.length, 0);
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('executeTool extract_import_graph returns python_tool_unavailable when extensionPath missing', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-no-ext-'));
        try {
            const controller = new ResearchController({ enablePythonTooling: true, extensionPath: undefined });
            const discoveredFiles = new Set<string>();
            const discoveredDirs = new Set<string>([tempRoot]);
            const result = await (controller as any).executeTool(
                'extract_import_graph',
                { filePaths: [], workspacePath: tempRoot },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            assert.ok(String(result.contextOutput).includes('python_tool_unavailable'));
            assert.strictEqual(result.evidence.length, 0);
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('multiple executeTool in one round: parallel execution preserves order and merges state', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-parallel-'));
        const srcDir = path.join(tempRoot, 'src');
        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(path.join(srcDir, 'a.ts'), 'export const a = 1;\n', 'utf8');
        await fs.writeFile(path.join(srcDir, 'b.ts'), 'export const b = 2;\n', 'utf8');
        try {
            const controller = new ResearchController({ maxSteps: 2, enablePythonTooling: false });
            const discoveredFiles = new Set<string>();
            const discoveredDirs = new Set<string>([tempRoot]);
            const promises = [
                (controller as any).executeTool('list_dir', { targetPath: srcDir }, tempRoot, discoveredFiles, discoveredDirs),
                (controller as any).executeTool('summarize_directory', { targetPath: tempRoot }, tempRoot, discoveredFiles, discoveredDirs)
            ];
            const results = await Promise.all(promises);
            assert.strictEqual(results.length, 2);
            assert.ok(String(results[0].contextOutput).includes('list_dir'));
            assert.ok(String(results[1].contextOutput).includes('summarize_directory'));
            assert.ok(results[0].evidence.length > 0 || results[1].evidence.length > 0);
            assert.ok(discoveredFiles.size > 0 || discoveredDirs.has(srcDir));
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('run completes without prerun when enablePythonTooling false (no Python tools in flow)', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-no-py-'));
        const srcDir = path.join(tempRoot, 'src');
        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(path.join(srcDir, 'main.ts'), 'export const x = 1;\n', 'utf8');
        try {
            const controller = new ResearchController({ maxSteps: 4, enablePythonTooling: false });
            const result = await controller.run('分析 main.ts', tempRoot);
            assert.ok(result.plan.length > 0);
            assert.ok(result.finalConclusion.length > 0);
            assert.strictEqual(result.steps[result.steps.length - 1].stage, 'FINAL');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('fallback prerun injects 预分析-降级 when Python is disabled', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-fallback-'));
        const srcDir = path.join(tempRoot, 'src');
        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(path.join(srcDir, 'main.ts'), 'export const x = 1;\n', 'utf8');
        try {
            const controller = new ResearchController({ maxSteps: 3, enablePythonTooling: false });
            const result = await controller.run('分析 main.ts', tempRoot);
            assert.ok(result.plan.length > 0, 'plan should be produced');
            if (result.debugLogPath) {
                const logContent = await fs.readFile(result.debugLogPath, 'utf8').catch(() => '');
                assert.ok(logContent.includes('【预分析-降级】'), 'debug log should contain fallback prerun marker');
                assert.ok(logContent.includes('项目根目录') || logContent.includes('入口文件'), 'fallback should include root summary or entrypoints');
            }
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('buildForcedFinalMessages with few readCodePaths adds need_more_evidence hint', () => {
        const controller = new ResearchController();
        const messages = (controller as any).buildForcedFinalMessages(
            'query',
            ['u1'],
            ['ref1', 'ref2'],
            ['/path/to/a.py', '/path/to/b.py']
        ) as any[];
        const userMsg = messages.find(m => m.role === 'user');
        assert.ok(userMsg, 'should have user message');
        const content = String(userMsg.content);
        assert.ok(content.includes('已读代码过少') || content.includes('need_more_evidence'), 'should hint need_more_evidence when read code files < 3');
    });

    test('buildForcedFinalMessages with many readCodePaths does not add must-return-need_more_evidence', () => {
        const controller = new ResearchController();
        const paths = ['a.py', 'b.py', 'c.py', 'd.py', 'e.py'];
        const messages = (controller as any).buildForcedFinalMessages(
            'query',
            [],
            ['r1'],
            paths
        ) as any[];
        const userMsg = messages.find(m => m.role === 'user');
        assert.ok(userMsg, 'should have user message');
        const content = String(userMsg.content);
        assert.ok(content.includes('共 5 个'), 'should state count of read code files');
        assert.ok(!content.includes('已读代码过少'), 'should not add 已读代码过少 when read code files >= 5');
    });

    test('getReadCodeCountFromSteps counts only read_skeleton and read_full_code', () => {
        const controller = new ResearchController();
        const steps = [
            { iteration: 1, stage: 'UPDATE' as const, action: 'list_dir', input: '', evidence: [], output: '' },
            { iteration: 2, stage: 'UPDATE' as const, action: 'read_skeleton', input: '', evidence: ['a.py'], output: '' },
            { iteration: 3, stage: 'UPDATE' as const, action: 'read_full_code', input: '', evidence: ['b.py'], output: '' }
        ];
        const count = (controller as any).getReadCodeCountFromSteps(steps);
        assert.strictEqual(count, 2, 'should count read_skeleton and read_full_code only');
    });

    test('executeTool when onPythonError returns skip then next Python tool returns python_tool_skipped', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cora-wiki-py-skip-'));
        try {
            let onPythonErrorCallCount = 0;
            const controller = new ResearchController({
                enablePythonTooling: true,
                extensionPath: os.tmpdir(),
                pythonPath: 'python3',
                onPythonError: async () => {
                    onPythonErrorCallCount += 1;
                    return 'skip';
                }
            });
            const discoveredFiles = new Set<string>();
            const discoveredDirs = new Set<string>([tempRoot]);
            const first = await (controller as any).executeTool(
                'extract_import_graph',
                { filePaths: [], workspacePath: tempRoot },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            assert.strictEqual(onPythonErrorCallCount, 1, 'onPythonError should be called once');
            assert.ok(String(first.contextOutput).includes('python_tool_skipped'), 'first call should return skip message');

            const second = await (controller as any).executeTool(
                'extract_import_graph',
                { filePaths: [], workspacePath: tempRoot },
                tempRoot,
                discoveredFiles,
                discoveredDirs
            );
            assert.strictEqual(onPythonErrorCallCount, 1, 'onPythonError should not be called again');
            assert.ok(String(second.contextOutput).includes('python_tool_skipped'), 'second call should return skip without prompting');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });
});

