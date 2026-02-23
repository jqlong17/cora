import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseHeadings, isMarkdownFile, getFileIcon } from '../../utils/markdownParser';
import { FilterMode } from '../../utils/constants';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('parseHeadings should extract headings from markdown content', () => {
        const content = `# Heading 1
Some text here
## Heading 2
More text
### Heading 3
Even more text
#### Heading 4
##### Heading 5
###### Heading 6`;

        const headings = parseHeadings(content);

        assert.strictEqual(headings.length, 6);
        assert.strictEqual(headings[0].level, 1);
        assert.strictEqual(headings[0].text, 'Heading 1');
        assert.strictEqual(headings[0].line, 0);
        assert.strictEqual(headings[1].level, 2);
        assert.strictEqual(headings[1].text, 'Heading 2');
        assert.strictEqual(headings[5].level, 6);
        assert.strictEqual(headings[5].text, 'Heading 6');
    });

    test('parseHeadings should handle headings with special characters', () => {
        const content = `# Heading with 中文
## Heading with *formatting*
### Heading with [link](url)`;

        const headings = parseHeadings(content);

        assert.strictEqual(headings.length, 3);
        assert.strictEqual(headings[0].text, 'Heading with 中文');
        assert.strictEqual(headings[1].text, 'Heading with *formatting*');
    });

    test('isMarkdownFile should identify markdown files correctly', () => {
        const extensions = ['.md', '.markdown', '.mdx'];

        assert.strictEqual(isMarkdownFile('test.md', extensions), true);
        assert.strictEqual(isMarkdownFile('test.markdown', extensions), true);
        assert.strictEqual(isMarkdownFile('test.mdx', extensions), true);
        assert.strictEqual(isMarkdownFile('test.txt', extensions), false);
        assert.strictEqual(isMarkdownFile('test.js', extensions), false);
        assert.strictEqual(isMarkdownFile('test', extensions), false);
    });

    test('isMarkdownFile should be case insensitive', () => {
        const extensions = ['.md', '.markdown'];

        assert.strictEqual(isMarkdownFile('test.MD', extensions), true);
        assert.strictEqual(isMarkdownFile('test.MarkDown', extensions), true);
    });

    test('getFileIcon should return correct icons', () => {
        assert.ok(getFileIcon('test.md').includes('markdown'));
        assert.ok(getFileIcon('test.txt').includes('file-text'));
        assert.ok(getFileIcon('test.json').includes('json'));
        assert.ok(getFileIcon('test.js').includes('file-code'));
        assert.ok(getFileIcon('test.png').includes('file-media'));
        assert.ok(getFileIcon('unknown').includes('file'));
    });
});
