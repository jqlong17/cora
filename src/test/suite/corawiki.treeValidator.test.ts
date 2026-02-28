import * as assert from 'assert';
import { repairTree, verifyTree } from '../../corawiki/treeValidator';
import type { CodeNode } from '../../corawiki/types';

suite('CoraWiki treeValidator Test Suite', () => {
    test('verifyTree should report duplicate nodeId', () => {
        const tree: CodeNode = {
            nodeId: 'a',
            type: 'workspace',
            path: '/tmp/ws',
            name: 'ws',
            children: [
                { nodeId: 'dup', type: 'file', path: '/tmp/ws/a.ts', name: 'a.ts', hash: 'h1', children: [] },
                { nodeId: 'dup', type: 'file', path: '/tmp/ws/b.ts', name: 'b.ts', hash: 'h2', children: [] }
            ]
        };

        const result = verifyTree(tree);
        assert.strictEqual(result.ok, false);
        assert.ok(result.issues.some(i => i.message.includes('duplicate nodeId')));
    });

    test('repairTree should fix duplicate ids and missing file hash', () => {
        const tree: CodeNode = {
            nodeId: 'x',
            type: 'workspace',
            path: '/tmp/ws',
            name: 'ws',
            children: [
                { nodeId: 'dup', type: 'file', path: '/tmp/ws/a.ts', name: 'a.ts', children: [] },
                { nodeId: 'dup', type: 'file', path: '/tmp/ws/b.ts', name: 'b.ts', children: [] }
            ]
        };

        const repaired = repairTree(tree);
        const ids = repaired.children.map(c => c.nodeId);
        assert.notStrictEqual(ids[0], ids[1]);
        assert.strictEqual(repaired.children[0].hash, 'unknown');
    });
});

