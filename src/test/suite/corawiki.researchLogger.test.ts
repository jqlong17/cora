import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResearchLogger } from '../../corawiki/researchLogger';

suite('CoraWiki researchLogger Test Suite', () => {
    test('should create txt log file and append readable entries', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corawiki-log-'));
        try {
            const logger = await ResearchLogger.create(tempRoot, new Date('2026-02-26T10:00:00.000Z'));
            await logger.append('api_request', { iteration: 1, messages: [{ role: 'user', content: 'hello' }] });
            await logger.append('api_response', {
                iteration: 1,
                usage: { total_tokens: 123 },
                apiKey: 'sk-1234567890',
                authorization: 'Bearer secret-token'
            });

            const filePath = logger.getPath();
            assert.ok(filePath.endsWith('.txt'), 'log file should be .txt');
            const content = await fs.readFile(filePath, 'utf8');
            assert.ok(content.includes('## api_request'), 'should have api_request section');
            assert.ok(content.includes('## api_response'), 'should have api_response section');
            assert.ok(content.includes('第 1 轮'), 'should include iteration in header');
            assert.ok(content.includes('total_tokens') || content.includes('123'), 'should log usage');
            assert.ok(!content.includes('sk-1234567890'), 'apiKey should be redacted');
            assert.ok(!content.includes('secret-token'), 'Bearer token should be redacted');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('appendReasoning should write dedicated reasoning block', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corawiki-reason-'));
        try {
            const logger = await ResearchLogger.create(tempRoot, new Date('2026-02-26T10:00:00.000Z'));
            await logger.appendReasoning(2, 'First step: read entrypoints. Second: trace calls.');

            const filePath = logger.getPath();
            const content = await fs.readFile(filePath, 'utf8');
            assert.ok(content.includes('## 第 2 轮 推理'), 'should have reasoning section header');
            assert.ok(content.includes('First step: read entrypoints'), 'should contain reasoning text');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    test('appendDecision should write decision block with content and tool names', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corawiki-decision-'));
        try {
            const logger = await ResearchLogger.create(tempRoot, new Date('2026-02-26T10:00:00.000Z'));
            await logger.appendDecision(2, '现在分析主要入口点。', ['read_full_code', 'list_dir']);

            const filePath = logger.getPath();
            const content = await fs.readFile(filePath, 'utf8');
            assert.ok(content.includes('## 第 2 轮 决策'), 'should have decision section header');
            assert.ok(content.includes('现在分析主要入口点'), 'should contain decision content');
            assert.ok(content.includes('本轮调用: read_full_code, list_dir'), 'should list tool names');
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });
});

