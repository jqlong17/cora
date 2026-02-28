import * as assert from 'assert';
import { appendAssistantToolCallMessage } from '../../corawiki/researchController';

suite('CoraWiki tool-call message regression', () => {
    test('appendAssistantToolCallMessage should keep provider-specific fields', () => {
        const messages: any[] = [];
        const assistantMsg = {
            role: 'assistant',
            content: '',
            reasoning_content: 'internal reasoning',
            tool_calls: [{ id: '1', type: 'function', function: { name: 'list_dir', arguments: '{}' } }]
        };

        appendAssistantToolCallMessage(messages, assistantMsg);

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0], assistantMsg, 'should push original object without dropping fields');
        assert.strictEqual(messages[0].reasoning_content, 'internal reasoning');
    });
});

