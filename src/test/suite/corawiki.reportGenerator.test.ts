import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { findLatestReportPath, renderMarkdownReport, saveReport } from '../../corawiki/reportGenerator';
import type { ResearchResult } from '../../corawiki/types';

suite('CoraWiki reportGenerator Test Suite', () => {
    const sampleResult: ResearchResult = {
        query: '分析订单链路',
        startedAt: '2026-02-26T10:00:00.000Z',
        endedAt: '2026-02-26T10:01:00.000Z',
        steps: [
            {
                iteration: 1,
                stage: 'PLAN',
                action: 'plan research',
                input: '订单链路',
                evidence: [],
                output: '先读取入口文件'
            }
        ],
        plan: '先定位入口，再追踪调用链',
        updates: ['已定位入口：src/order.ts'],
        finalConclusion: '订单从 controller 到 repository 完成落库。',
        references: ['src/order.ts:12-20'],
        tokenUsage: {
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
            cachedTokens: 40
        },
        diagrams: ['graph TD\nA[Order] --> B[Repository]'],
        moduleSummaries: ['order: 负责订单聚合与落库'],
        architectureFindings: [
            {
                title: '控制器直接依赖仓储',
                judgement: '存在跨层耦合，建议引入应用服务层',
                evidence: ['src/order.ts:12-20']
            }
        ],
        criticalFlows: [
            {
                name: '下单主链路',
                steps: ['OrderController.create', 'OrderService.create', 'OrderRepository.save'],
                evidence: ['src/order.ts:12-20']
            }
        ],
        risks: [
            {
                risk: '事务边界不清晰',
                impact: '并发下可能出现部分写入',
                evidence: ['src/order.ts:12-20']
            }
        ],
        unknowns: ['未发现跨模块事务一致性测试']
    };

    test('renderMarkdownReport should include key sections per template', () => {
        const md = renderMarkdownReport(sampleResult, '/tmp/ws');
        assert.ok(md.includes('# CoraWiki Research Report'));
        assert.ok(md.includes('## What is ws?'));
        assert.ok(md.includes('## Overview'));
        assert.ok(md.includes('## System Architecture Overview'));
        assert.ok(md.includes('### Key Code Entities'));
        assert.ok(md.includes('## Core Components'));
        assert.ok(md.includes('## Data Flow'));
        assert.ok(md.includes('## Key File Structure'));
        assert.ok(md.includes('## 总结'));
        assert.ok(md.includes('Token Usage: prompt=100, completion=20, total=120, cached=40'));
        assert.ok(md.includes('```mermaid'));
        assert.ok(md.includes('分析报告产出来自于 Cora'));
    });

    test('saveReport/findLatestReportPath should persist and resolve latest report', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corawiki-report-'));
        try {
            const md = renderMarkdownReport(sampleResult);
            const oldPath = await saveReport(tempRoot, md, new Date('2026-02-26T10:00:00.000Z'));
            const newPath = await saveReport(tempRoot, md, new Date('2026-02-26T10:00:05.000Z'));
            const latest = await findLatestReportPath(tempRoot);

            assert.ok(oldPath.endsWith('.md'));
            assert.ok(newPath.endsWith('.md'));
            assert.strictEqual(latest, newPath);
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('renderMarkdownReport should match golden section signature', async () => {
        const md = renderMarkdownReport(sampleResult, '/tmp/ws');
        const actualSignature = md
            .split('\n')
            .filter(line => /^##\s|^###\s/.test(line))
            .join('\n');
        const fixturePath = path.join(process.cwd(), 'src', 'test', 'fixtures', 'corawiki.report.golden.md');
        const expectedSignature = (await fs.readFile(fixturePath, 'utf8'))
            .split('\n')
            .filter(line => /^##\s|^###\s/.test(line))
            .join('\n');
        assert.strictEqual(actualSignature, expectedSignature);
    });

    test('Overview section is brief and not identical to 总结', () => {
        const longConclusion =
            '订单从 controller 到 repository 完成落库。' +
            '建议引入应用服务层以解耦。风险包括事务边界不清晰。'.repeat(20);
        const resultWithLongConclusion: ResearchResult = {
            ...sampleResult,
            finalConclusion: longConclusion
        };
        const md = renderMarkdownReport(resultWithLongConclusion, '/tmp/ws');
        const sections = md.split(/\n## /);
        const overviewBlock = sections.find(s => s.startsWith('Overview'));
        const summaryBlock = sections.find(s => s.startsWith('总结'));
        const overviewBody = overviewBlock
            ? overviewBlock.replace(/^Overview\s*\n+/, '').split(/\n## /)[0].trim()
            : '';
        const summaryBody = summaryBlock
            ? summaryBlock.replace(/^总结\s*\n+/, '').split(/\n## /)[0].trim()
            : '';
        assert.ok(overviewBody.length <= summaryBody.length, 'Overview should not be longer than 总结');
        assert.notStrictEqual(overviewBody, summaryBody, 'Overview and 总结 should not be identical');
        assert.ok(
            overviewBody.endsWith('…') || overviewBody.length <= 201,
            'Overview should be truncated with … when conclusion is long'
        );
    });
});

