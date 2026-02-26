import * as assert from 'assert';
import { createLLMClient } from '../../corawiki/llmClient';

suite('CoraWiki llmClient Test Suite', () => {
    test('createLLMClient should create client with baseURL', () => {
        const client = createLLMClient({
            provider: 'openai',
            apiKey: 'test-key',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini'
        });

        assert.ok(client, 'client should be created');
    });
});

