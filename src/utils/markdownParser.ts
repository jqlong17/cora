import { Heading, HEADING_REGEX } from './constants';

export function parseHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            headings.push({
                level: match[1].length,
                text: match[2].trim(),
                line: i
            });
        }
    }

    return headings;
}

export function isMarkdownFile(fileName: string, extensions: string[]): boolean {
    const lowerFileName = fileName.toLowerCase();
    return extensions.some(ext => lowerFileName.endsWith(ext.toLowerCase()));
}

export function getFileIcon(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();

    switch (ext) {
        case 'md':
        case 'markdown':
        case 'mdx':
            return '$(markdown)';
        case 'txt':
            return '$(file-text)';
        case 'json':
            return '$(json)';
        case 'js':
        case 'ts':
            return '$(file-code)';
        case 'html':
        case 'css':
            return '$(file-code)';
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
            return '$(file-media)';
        case 'pdf':
            return '$(file-pdf)';
        default:
            return '$(file)';
    }
}

export function sanitizeFileName(name: string): string {
    // Remove characters that are invalid in file names
    return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

export function generateNoteTitle(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `未命名笔记 ${dateStr} ${timeStr}`;
}
