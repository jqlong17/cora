import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import type { CodeNode } from './types';
import { readSkeleton } from './tools';

export interface BuildCodeTreeOptions {
    include?: string[];
    exclude?: string[];
    maxDepth?: number;
    maxFiles?: number;
}

let nodeCounter = 0;
function nextNodeId(): string {
    nodeCounter += 1;
    return `node_${String(nodeCounter).padStart(6, '0')}`;
}

function shouldSkip(entryPath: string, options: BuildCodeTreeOptions): boolean {
    const normalized = entryPath.replace(/\\/g, '/');
    const exclude = options.exclude ?? ['.git', 'node_modules', 'dist', 'build'];
    if (exclude.some(item => normalized.includes(`/${item}`) || normalized.endsWith(`/${item}`) || normalized.endsWith(item))) {
        return true;
    }
    if (options.include && options.include.length > 0) {
        return !options.include.some(item => normalized.includes(item));
    }
    return false;
}

async function fileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
}

function isCodeFile(fileName: string): boolean {
    return /\.(ts|tsx|js|jsx|py|go|java|rs|md|mdx)$/i.test(fileName);
}

export async function buildCodeTree(workspacePath: string, options: BuildCodeTreeOptions = {}): Promise<CodeNode> {
    nodeCounter = 0;
    const maxDepth = options.maxDepth ?? 4;
    const maxFiles = options.maxFiles ?? 500;
    let fileCount = 0;

    async function walk(currentPath: string, depth: number): Promise<CodeNode | null> {
        if (shouldSkip(currentPath, options)) {
            return null;
        }
        const stat = await fs.stat(currentPath);
        const name = path.basename(currentPath);

        if (stat.isDirectory()) {
            if (depth > maxDepth) {
                return null;
            }
            const children: CodeNode[] = [];
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const childPath = path.join(currentPath, entry.name);
                const child = await walk(childPath, depth + 1);
                if (child) {
                    children.push(child);
                }
            }
            return {
                nodeId: nextNodeId(),
                type: depth === 0 ? 'workspace' : 'directory',
                path: currentPath,
                name,
                children
            };
        }

        if (!isCodeFile(name) || fileCount >= maxFiles) {
            return null;
        }
        fileCount += 1;

        const skeleton = await readSkeleton(currentPath);
        const symbolChildren: CodeNode[] = skeleton.symbols.slice(0, 50).map(symbol => ({
            nodeId: nextNodeId(),
            type: 'symbol',
            path: currentPath,
            name: symbol,
            signature: symbol,
            children: []
        }));

        return {
            nodeId: nextNodeId(),
            type: 'file',
            path: currentPath,
            name,
            hash: await fileHash(currentPath),
            summary: `imports=${skeleton.imports.length}, symbols=${skeleton.symbols.length}`,
            children: symbolChildren
        };
    }

    const tree = await walk(workspacePath, 0);
    if (!tree) {
        return {
            nodeId: nextNodeId(),
            type: 'workspace',
            path: workspacePath,
            name: path.basename(workspacePath),
            children: []
        };
    }
    return tree;
}

