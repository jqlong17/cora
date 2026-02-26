import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export interface ListDirOptions {
    maxEntries?: number;
    includeHidden?: boolean;
}

export interface DirEntryInfo {
    name: string;
    path: string;
    type: 'file' | 'directory' | 'other';
}

export interface SkeletonResult {
    filePath: string;
    hash: string;
    imports: string[];
    symbols: string[];
}

export async function listDir(root: string, options: ListDirOptions = {}): Promise<DirEntryInfo[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const includeHidden = options.includeHidden ?? false;
    const maxEntries = options.maxEntries ?? 200;

    const results: DirEntryInfo[] = [];
    for (const entry of entries) {
        if (!includeHidden && entry.name.startsWith('.')) {
            continue;
        }

        const fullPath = path.join(root, entry.name);
        results.push({
            name: entry.name,
            path: fullPath,
            type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other'
        });

        if (results.length >= maxEntries) {
            break;
        }
    }

    return results;
}

export async function readFullCode(filePath: string, range?: { startLine?: number; endLine?: number }): Promise<string> {
    const content = await fs.readFile(filePath, 'utf8');
    if (!range?.startLine && !range?.endLine) {
        return content;
    }

    const lines = content.split('\n');
    const start = Math.max(1, range.startLine ?? 1);
    const end = Math.min(lines.length, range.endLine ?? lines.length);
    return lines.slice(start - 1, end).join('\n');
}

export async function readSkeleton(filePath: string): Promise<SkeletonResult> {
    const content = await fs.readFile(filePath, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');

    const imports = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('import ') || line.startsWith('from '))
        .slice(0, 100);

    const symbols = content
        .split('\n')
        .map(line => line.trim())
        .filter(line =>
            line.startsWith('function ') ||
            line.startsWith('export function ') ||
            line.startsWith('class ') ||
            line.startsWith('export class ') ||
            line.startsWith('const ') ||
            line.startsWith('export const ')
        )
        .slice(0, 200);

    return {
        filePath,
        hash,
        imports,
        symbols
    };
}

