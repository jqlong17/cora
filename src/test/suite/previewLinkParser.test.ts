import * as assert from 'assert';
import * as os from 'os';
import {
    parseCommandUri,
    parseLineFromHash,
    parseFileLink,
    computeMermaidFitScale,
    extractPngBase64FromDataUrl
} from '../../utils/previewLinkParser';

suite('Preview link parser Test Suite', () => {
    suite('parseCommandUri', () => {
        test('parses command without query', () => {
            const r = parseCommandUri('command:knowledgeBase.openCoraWikiReport');
            assert.ok(r);
            assert.strictEqual(r!.commandId, 'knowledgeBase.openCoraWikiReport');
            assert.deepStrictEqual(r!.args, []);
        });

        test('parses command with JSON array query (CoraWiki reference)', () => {
            const encoded = encodeURIComponent(JSON.stringify(['src/order.ts:12-20']));
            const r = parseCommandUri(`command:knowledgeBase.openCoraWikiReference?${encoded}`);
            assert.ok(r);
            assert.strictEqual(r!.commandId, 'knowledgeBase.openCoraWikiReference');
            assert.deepStrictEqual(r!.args, ['src/order.ts:12-20']);
        });

        test('returns null for non-command href', () => {
            assert.strictEqual(parseCommandUri('file:///tmp/foo.ts'), null);
            assert.strictEqual(parseCommandUri('https://example.com'), null);
            assert.strictEqual(parseCommandUri('src/foo.ts'), null);
        });

        test('returns null for empty command id', () => {
            const r = parseCommandUri('command:?foo=bar');
            assert.strictEqual(r, null);
        });
    });

    suite('parseLineFromHash', () => {
        test('extracts line from #L5', () => {
            assert.strictEqual(parseLineFromHash('file:///a/b#L5'), 5);
        });
        test('extracts line from #L5-L10', () => {
            assert.strictEqual(parseLineFromHash('file:///a/b#L5-L10'), 5);
        });
        test('extracts line from #5', () => {
            assert.strictEqual(parseLineFromHash('src/foo.ts#5'), 5);
        });
        test('returns undefined when no hash', () => {
            assert.strictEqual(parseLineFromHash('src/foo.ts'), undefined);
        });
    });

    suite('parseFileLink', () => {
        const baseDir = os.platform() === 'win32' ? 'C:\\ws' : '/ws';

        test('parses relative path with line', () => {
            const r = parseFileLink('src/order.ts#L12', baseDir);
            assert.ok(r);
            assert.ok(r!.resolvedPath.endsWith('order.ts') || r!.resolvedPath.includes('order.ts'));
            assert.strictEqual(r!.line, 12);
        });

        test('parses relative path without line', () => {
            const r = parseFileLink('README.md', baseDir);
            assert.ok(r);
            assert.ok(r!.resolvedPath.endsWith('README.md') || r!.resolvedPath.includes('README.md'));
            assert.strictEqual(r!.line, undefined);
        });

        test('parses file:// URL and extracts line', () => {
            const filePath = os.platform() === 'win32' ? 'C:/ws/src/foo.ts' : '/ws/src/foo.ts';
            const fileUrl = 'file:///' + filePath.replace(/\\/g, '/') + '#L5';
            const r = parseFileLink(fileUrl, baseDir);
            assert.ok(r);
            assert.ok(r!.resolvedPath.includes('foo.ts'));
            assert.strictEqual(r!.line, 5);
        });

        test('returns null for http href', () => {
            assert.strictEqual(parseFileLink('https://example.com', baseDir), null);
        });
    });

    suite('computeMermaidFitScale', () => {
        test('scales up small content to fill container with margin', () => {
            const scale = computeMermaidFitScale(800, 600, 400, 300, 0.9);
            assert.ok(scale >= 1.5 && scale <= 2);
            assert.strictEqual(scale, Math.min(800 / 400, 600 / 300) * 0.9);
        });

        test('scales down large content to fit', () => {
            const scale = computeMermaidFitScale(800, 600, 2000, 1500, 0.9);
            assert.ok(scale < 1);
            assert.ok(scale >= 0.25);
        });

        test('clamps to [0.25, 3]', () => {
            assert.strictEqual(computeMermaidFitScale(10000, 10000, 1, 1, 1), 3);
            assert.strictEqual(computeMermaidFitScale(1, 1, 10000, 10000, 0.25), 0.25);
        });

        test('returns 1 when container or content has zero dimension', () => {
            assert.strictEqual(computeMermaidFitScale(0, 600, 400, 300), 1);
            assert.strictEqual(computeMermaidFitScale(800, 600, 0, 300), 1);
        });
    });

    suite('extractPngBase64FromDataUrl', () => {
        test('extracts base64 from valid data URL', () => {
            const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
            const dataUrl = `data:image/png;base64,${b64}`;
            assert.strictEqual(extractPngBase64FromDataUrl(dataUrl), b64);
        });

        test('accepts data URL with different casing', () => {
            const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
            assert.strictEqual(
                extractPngBase64FromDataUrl('data:image/PNG;base64,' + b64),
                b64
            );
        });

        test('returns null for short string', () => {
            assert.strictEqual(extractPngBase64FromDataUrl('data:image/png;base64,'), null);
        });

        test('returns null for non-string', () => {
            assert.strictEqual(extractPngBase64FromDataUrl(null as any), null);
        });
    });
});
