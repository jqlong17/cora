import { spawn } from 'child_process';
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
    const lines = content.split('\n');
    if (!range?.startLine && !range?.endLine) {
        const maxDefaultLines = 300;
        if (lines.length <= maxDefaultLines) {
            return content;
        }
        const head = lines.slice(0, 200).join('\n');
        const tail = lines.slice(-100).join('\n');
        return `${head}\n\n... [omitted ${lines.length - 300} lines] ...\n\n${tail}`;
    }

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

const ENTRY_NAME_PATTERNS = [
    /^main\.(py|ts|js)$/,
    /^app\.(py|ts|js)$/,
    /^server\.(py|ts|js)$/,
    /^index\.(ts|js|tsx|jsx)$/
];
const ENTRY_CONTENT_PATTERNS = [
    /express\.Router|new\s+Router|APIRouter|Fastify\(|createServer|app\.listen|listen\(/i,
    /@app\.(get|post|put|delete|patch)|@router\.|flask\.Flask|FastAPI\(/i
];
const DEFAULT_EXCLUDE = ['.git', 'node_modules', 'dist', 'build', '__pycache__', '.venv', 'venv'];

export interface DiscoverEntrypointItem {
    filePath: string;
    type: 'main' | 'entry' | 'route' | 'config';
    description: string;
}

export async function discoverEntrypoints(workspacePath: string): Promise<DiscoverEntrypointItem[]> {
    const results: DiscoverEntrypointItem[] = [];
    const seen = new Set<string>();
    const MAX_ENTRIES = 30;

    function add(filePath: string, type: DiscoverEntrypointItem['type'], description: string): void {
        const key = path.normalize(filePath);
        if (!seen.has(key) && results.length < MAX_ENTRIES) {
            seen.add(key);
            results.push({ filePath, type, description });
        }
    }

    const pkgPath = path.join(workspacePath, 'package.json');
    try {
        const pkgContent = await fs.readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
        const main = pkg.main as string | undefined;
        const module = pkg.module as string | undefined;
        const exportsObj = pkg.exports as Record<string, string> | string | undefined;
        if (main && typeof main === 'string') {
            const resolved = path.join(workspacePath, main.replace(/^\.\//, ''));
            add(resolved, 'config', `package.json main: ${main}`);
        }
        if (module && typeof module === 'string') {
            const resolved = path.join(workspacePath, module.replace(/^\.\//, ''));
            add(resolved, 'config', `package.json module: ${module}`);
        }
        if (exportsObj && typeof exportsObj === 'object' && !Array.isArray(exportsObj)) {
            const entries = Object.entries(exportsObj);
            for (const [key, val] of entries.slice(0, 5)) {
                const target = typeof val === 'string' ? val : (val as Record<string, string>)?.default ?? (val as Record<string, string>)?.['.'];
                if (target && typeof target === 'string' && (target.endsWith('.js') || target.endsWith('.ts'))) {
                    const resolved = path.join(workspacePath, target.replace(/^\.\//, ''));
                    add(resolved, 'config', `package.json exports.${key}`);
                }
            }
        }
    } catch {
        // no package.json or invalid
    }

    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > 4 || results.length >= MAX_ENTRIES) return;
        let entries: { name: string; isFile: () => boolean }[];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (DEFAULT_EXCLUDE.includes(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isFile()) {
                const base = e.name.toLowerCase();
                if (/^main\.(py|ts|js)$/.test(base)) {
                    add(full, 'main', `entry file: ${e.name}`);
                } else if (/^app\.(py|ts|js)$/.test(base) || /^index\.(ts|js|tsx|jsx)$/.test(base)) {
                    add(full, 'entry', `entry file: ${e.name}`);
                } else if (/^server\.(py|ts|js)$/.test(base)) {
                    add(full, 'entry', `server entry: ${e.name}`);
                } else if (/\.(py|ts|js|tsx|jsx)$/.test(base)) {
                    try {
                        const content = await fs.readFile(full, 'utf8');
                        if (ENTRY_CONTENT_PATTERNS.some(re => re.test(content))) {
                            add(full, 'route', 'contains router/API/server pattern');
                        }
                    } catch {
                        // skip unreadable
                    }
                }
            } else {
                await walk(full, depth + 1);
            }
        }
    }
    await walk(workspacePath, 0);
    return results;
}

export interface DependencyResult {
    filePath: string;
    imports: string[];
    localDeps: string[];
    externalDeps: string[];
}

function extractImports(content: string): string[] {
    const imports: string[] = [];
    const fromRe = /(?:import\s+.*?\s+from|from)\s+['"]([^'"]+)['"]/g;
    const importRe = /import\s+['"]([^'"]+)['"]/g;
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const re of [fromRe, importRe, requireRe]) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
            const spec = (m[1] ?? '').trim();
            if (spec && !imports.includes(spec)) imports.push(spec);
        }
    }
    return imports;
}

export async function analyzeDependencies(
    filePaths: string[],
    workspacePath: string
): Promise<DependencyResult[]> {
    const workspaceNorm = path.normalize(workspacePath);
    const results: DependencyResult[] = [];

    for (const fp of filePaths) {
        let content: string;
        try {
            content = await fs.readFile(fp, 'utf8');
        } catch {
            results.push({ filePath: fp, imports: [], localDeps: [], externalDeps: [] });
            continue;
        }
        const imports = extractImports(content);
        const localDeps: string[] = [];
        const externalDeps: string[] = [];
        for (const imp of imports) {
            if (imp.startsWith('.') || imp.startsWith('/')) {
                try {
                    const resolved = path.normalize(path.resolve(path.dirname(fp), imp));
                    if (resolved.startsWith(workspaceNorm)) {
                        localDeps.push(imp);
                    } else {
                        externalDeps.push(imp);
                    }
                } catch {
                    externalDeps.push(imp);
                }
            } else {
                externalDeps.push(imp);
            }
        }
        results.push({
            filePath: fp,
            imports,
            localDeps: Array.from(new Set(localDeps)),
            externalDeps: Array.from(new Set(externalDeps))
        });
    }
    return results;
}

export interface SummarizeResult {
    path: string;
    fileCount: number;
    dirCount: number;
    codeFiles: number;
    markdownFiles: number;
    configFiles: number;
}

const CODE_EXT = /\.(ts|js|tsx|jsx|py|go|rs|java|kt|swift|c|cpp|m)$/i;
const MD_EXT = /\.(md|markdown|mdx|mdc)$/i;
const CONFIG_EXT = /\.(json|yaml|yml|toml|env|config\.\w+)$/i;

export async function summarizeDirectory(targetPath: string): Promise<SummarizeResult> {
    let fileCount = 0;
    let dirCount = 0;
    let codeFiles = 0;
    let markdownFiles = 0;
    let configFiles = 0;

    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > 6) return;
        let entries: { name: string; isFile: () => boolean }[];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (e.name.startsWith('.') && e.name !== '.env') continue;
            if (DEFAULT_EXCLUDE.includes(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isFile()) {
                fileCount += 1;
                const base = e.name.toLowerCase();
                if (CODE_EXT.test(base)) codeFiles += 1;
                else if (MD_EXT.test(base)) markdownFiles += 1;
                else if (CONFIG_EXT.test(base)) configFiles += 1;
            } else {
                dirCount += 1;
                await walk(full, depth + 1);
            }
        }
    }

    let stat: { isDirectory: () => boolean };
    try {
        stat = await fs.stat(targetPath);
    } catch {
        return {
            path: targetPath,
            fileCount: 0,
            dirCount: 0,
            codeFiles: 0,
            markdownFiles: 0,
            configFiles: 0
        };
    }
    if (!stat.isDirectory()) {
        return {
            path: targetPath,
            fileCount: 0,
            dirCount: 0,
            codeFiles: 0,
            markdownFiles: 0,
            configFiles: 0
        };
    }
    await walk(targetPath, 0);
    return {
        path: targetPath,
        fileCount,
        dirCount,
        codeFiles,
        markdownFiles,
        configFiles
    };
}

export interface RunPythonToolResult {
    ok: true;
    result: unknown;
}
export interface RunPythonToolError {
    ok: false;
    error: string;
}

/**
 * 轻量检测：runner.py 存在且 python 可执行。用于启动前决定是否提示用户安装/跳过。
 */
export async function checkPythonAvailable(
    extensionPath: string,
    pythonPath: string
): Promise<{ ok: true } | RunPythonToolError> {
    if (!extensionPath || !pythonPath) {
        return { ok: false, error: 'extensionPath or pythonPath not set' };
    }
    const runnerPath = path.join(extensionPath, 'corawiki-pytools', 'runner.py');
    try {
        await fs.access(runnerPath);
    } catch {
        return { ok: false, error: `Python runner not found: ${runnerPath}` };
    }
    const ok = await new Promise<boolean>((resolve) => {
        const proc = spawn(pythonPath, ['-c', 'print(1)'], { stdio: 'pipe' });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
    if (!ok) {
        return { ok: false, error: `Python not runnable: ${pythonPath}` };
    }
    return { ok: true };
}

/**
 * Run a CoraWiki Python tool (extract_import_graph, analyze_complexity) via runner.py.
 * Requires extensionPath (where corawiki-pytools/ lives) and pythonPath (e.g. "python3").
 */
export async function runPythonTool(
    extensionPath: string,
    pythonPath: string,
    toolName: string,
    args: Record<string, unknown>,
    workspacePath: string
): Promise<RunPythonToolResult | RunPythonToolError> {
    if (!extensionPath || !pythonPath) {
        return { ok: false, error: 'Python tools not available (extensionPath or pythonPath not set)' };
    }
    const runnerPath = path.join(extensionPath, 'corawiki-pytools', 'runner.py');
    try {
        await fs.access(runnerPath);
    } catch {
        return { ok: false, error: `Python runner not found: ${runnerPath}. Enable Python tooling and ensure extension is installed correctly.` };
    }
    const input = JSON.stringify({ tool: toolName, args, workspacePath });
    return new Promise((resolve) => {
        const proc = spawn(pythonPath, [runnerPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: workspacePath
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        proc.on('error', (err) => {
            resolve({ ok: false, error: `Failed to start Python: ${err.message}` });
        });
        proc.on('close', (code) => {
            if (code !== 0 && !stdout.trim()) {
                resolve({ ok: false, error: stderr.trim() || `Python exited with code ${code}` });
                return;
            }
            try {
                const out = JSON.parse(stdout.trim());
                if (out.ok === true && 'result' in out) {
                    resolve({ ok: true, result: out.result });
                } else {
                    resolve({ ok: false, error: (out as { error?: string }).error || 'Invalid Python tool response' });
                }
            } catch {
                resolve({ ok: false, error: stderr.trim() || stdout.slice(0, 200) || 'Invalid JSON from Python tool' });
            }
        });
        proc.stdin?.end(input, 'utf8');
    });
}

