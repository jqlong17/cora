import * as fs from 'fs/promises';
import * as path from 'path';

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function makeRunName(date: Date): string {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `corawiki-run-${y}${m}${d}-${hh}${mm}${ss}.txt`;
}

const MAX_INLINE_LEN = 400;

function formatPayloadAsText(payload: unknown): string {
    if (payload === null || payload === undefined) {
        return '(empty)';
    }
    if (typeof payload === 'string') {
        return payload;
    }
    if (typeof payload === 'object' && !Array.isArray(payload)) {
        const lines: string[] = [];
        for (const [k, v] of Object.entries(payload)) {
            if (v === undefined) continue;
            if (typeof v === 'string') {
                if (v.length <= MAX_INLINE_LEN) {
                    lines.push(`${k}: ${v}`);
                } else {
                    lines.push(`${k}: (${v.length} chars, first ${MAX_INLINE_LEN} below)`);
                    lines.push(v.slice(0, MAX_INLINE_LEN) + (v.length > MAX_INLINE_LEN ? '…' : ''));
                }
            } else if (typeof v === 'number' || typeof v === 'boolean') {
                lines.push(`${k}: ${v}`);
            } else if (Array.isArray(v)) {
                try {
                    const preview = v.length <= 20 ? JSON.stringify(v) : `[${v.length} items] ${JSON.stringify(v.slice(0, 5))}…`;
                    lines.push(`${k}: ${preview}`);
                } catch {
                    lines.push(`${k}: [${v.length} items]`);
                }
            } else if (typeof v === 'object' && v !== null && Object.keys(v).length <= 8) {
                try {
                    lines.push(`${k}: ${JSON.stringify(v)}`);
                } catch {
                    lines.push(`${k}: (see below)`);
                }
            } else {
                lines.push(`${k}: (see below)`);
            }
        }
        return lines.join('\n');
    }
    try {
        return JSON.stringify(payload);
    } catch {
        return '[unserializable]';
    }
}

export class ResearchLogger {
    private readonly filePath: string;

    private constructor(filePath: string) {
        this.filePath = filePath;
    }

    static async create(workspacePath: string, now: Date = new Date()): Promise<ResearchLogger> {
        const logDir = path.join(workspacePath, '.cora', 'logs');
        await fs.mkdir(logDir, { recursive: true });
        const filePath = path.join(logDir, makeRunName(now));
        return new ResearchLogger(filePath);
    }

    getPath(): string {
        return this.filePath;
    }

    /** 追加一条可读的 txt 段落（带时间戳与类型标题）。 */
    async append(type: string, payload: unknown): Promise<void> {
        const ts = new Date().toISOString();
        const safe = this.redact(payload);
        const iter = typeof safe === 'object' && safe !== null && 'iteration' in safe
            ? ` 第 ${(safe as { iteration?: number }).iteration} 轮` : '';
        const header = `\n## ${type}${iter} [${ts}]\n`;
        const body = formatPayloadAsText(safe);
        await fs.appendFile(this.filePath, header + body + '\n', 'utf8');
    }

    /** 追加当轮推理内容为独立段落，便于排查。 */
    async appendReasoning(iteration: number, reasoningText: string): Promise<void> {
        const ts = new Date().toISOString();
        const safe = this.redactString(reasoningText);
        const block = `\n## 第 ${iteration} 轮 推理 [${ts}]\n\n${safe}\n`;
        await fs.appendFile(this.filePath, block, 'utf8');
    }

    /** 追加当轮 agent 决策：当轮 content + 本轮调用工具列表，便于排查。 */
    async appendDecision(iteration: number, content: string, toolNames: string[]): Promise<void> {
        const ts = new Date().toISOString();
        const safeContent = this.redactString(content);
        const toolsLine = toolNames.length > 0 ? toolNames.join(', ') : '(无)';
        const block = `\n## 第 ${iteration} 轮 决策 [${ts}]\n\n${safeContent}\n\n本轮调用: ${toolsLine}\n`;
        await fs.appendFile(this.filePath, block, 'utf8');
    }

    private redactString(s: string): string {
        return s
            .replace(/(sk-[A-Za-z0-9_\-]{8,})/g, '***REDACTED***')
            .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1***REDACTED***');
    }

    private redact(value: unknown): unknown {
        if (value === null || value === undefined) {
            return value;
        }
        if (typeof value === 'string') {
            return this.redactString(value);
        }
        if (Array.isArray(value)) {
            return value.map(item => this.redact(item));
        }
        if (typeof value === 'object') {
            const output: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
                if (/(api[_-]?key|authorization|secret|password|access[_-]?token|refresh[_-]?token|id[_-]?token)/i.test(key)) {
                    output[key] = '***REDACTED***';
                } else {
                    output[key] = this.redact(val);
                }
            }
            return output;
        }
        return value;
    }
}

