import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CodeNode } from './types';

export interface CachedCodeTree {
    workspacePath: string;
    createdAt: number;
    tree: CodeNode;
}

function getCacheFile(workspacePath: string): string {
    const safeName = workspacePath.replace(/[\/\\:\s]/g, '_');
    return path.join(os.homedir(), '.cora', 'corawiki-cache', `${safeName}.json`);
}

export async function loadCachedTree(workspacePath: string, ttlSec: number): Promise<CodeNode | null> {
    const cacheFile = getCacheFile(workspacePath);
    try {
        const raw = await fs.readFile(cacheFile, 'utf8');
        const parsed = JSON.parse(raw) as CachedCodeTree;
        const ageMs = Date.now() - parsed.createdAt;
        if (ttlSec <= 0 || ageMs > ttlSec * 1000) {
            return null;
        }
        return parsed.tree;
    } catch {
        return null;
    }
}

export async function saveCachedTree(workspacePath: string, tree: CodeNode): Promise<void> {
    const cacheFile = getCacheFile(workspacePath);
    const payload: CachedCodeTree = {
        workspacePath,
        createdAt: Date.now(),
        tree
    };
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(payload), 'utf8');
}

export async function clearCachedTree(workspacePath: string): Promise<void> {
    const cacheFile = getCacheFile(workspacePath);
    await fs.rm(cacheFile, { force: true });
}

