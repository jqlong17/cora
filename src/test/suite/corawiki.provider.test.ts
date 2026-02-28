import * as assert from 'assert';
import { CoraWikiProvider } from '../../providers/coraWikiProvider';
import type { ResearchResult } from '../../corawiki/types';

suite('CoraWiki provider Test Suite', () => {
    test('setReports should create clickable report items', async () => {
        const provider = new CoraWikiProvider();
        const result: ResearchResult = {
            query: 'Q',
            startedAt: '2026-02-26T00:00:00.000Z',
            endedAt: '2026-02-26T00:01:00.000Z',
            steps: [
                {
                    iteration: 1,
                    stage: 'PLAN',
                    action: 'scan',
                    input: 'Q',
                    evidence: [],
                    output: 'done'
                }
            ],
            plan: 'P',
            updates: [],
            finalConclusion: 'C',
            references: ['src/a.ts:2']
        };

        provider.setResult(result);
        provider.setReports(['/tmp/corawiki-20260226-151605.md', '/tmp/corawiki-20260226-151243.md']);

        const roots = (await provider.getChildren()) ?? [];
        assert.strictEqual(roots.length, 2);
        assert.strictEqual(provider.getLatestReportPath(), '/tmp/corawiki-20260226-151605.md');
        assert.strictEqual(provider.getLatestResult(), result);
        assert.strictEqual(roots[0].label, '2026-02-26 15:16 架构报告');
        assert.strictEqual(roots[0].command?.command, 'knowledgeBase.openCoraWikiReport');
        assert.deepStrictEqual(roots[0].command?.arguments, ['/tmp/corawiki-20260226-151605.md']);
        assert.ok(roots[0].description);
    });
});

