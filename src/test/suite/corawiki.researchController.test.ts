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
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });
});

