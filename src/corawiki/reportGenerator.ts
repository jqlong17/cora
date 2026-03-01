import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { ResearchResult } from './types';

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function makeTimestampFileName(date: Date): string {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `corawiki-${y}${m}${d}-${hh}${mm}${ss}.md`;
}

interface ParsedReference {
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
}

function parseReference(rawRef: string): ParsedReference {
    const trimmed = rawRef.trim();
    const match = /^(.*?):(\d+)(?:-(\d+))?$/.exec(trimmed);
    if (!match) {
        return { filePath: trimmed };
    }
    return {
        filePath: match[1],
        lineStart: Number(match[2]),
        lineEnd: match[3] ? Number(match[3]) : undefined
    };
}

function toCommandReferenceLink(rawRef: string): string {
    const args = encodeURIComponent(JSON.stringify([rawRef]));
    return `command:knowledgeBase.openCoraWikiReference?${args}`;
}

function toReferenceMarkdown(rawRef: string, workspacePath?: string): string {
    if (!workspacePath) {
        return `- \`${rawRef}\``;
    }
    const parsed = parseReference(rawRef);
    if (!parsed.filePath) {
        return `- \`${rawRef}\``;
    }
    const absolutePath = path.isAbsolute(parsed.filePath)
        ? parsed.filePath
        : path.join(workspacePath, parsed.filePath);
    const commandLink = toCommandReferenceLink(rawRef);
    const fileLink = pathToFileURL(absolutePath).toString();
    const lineRange = parsed.lineStart
        ? (parsed.lineEnd ? `#L${parsed.lineStart}-L${parsed.lineEnd}` : `#L${parsed.lineStart}`)
        : '';
    const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
    const label = lineRange ? `${relativePath}${lineRange}` : relativePath;
    return `- [${label}](${commandLink}) ([raw-file](${fileLink}))`;
}

function getRelevantSourceFiles(references: string[]): string[] {
    const files = new Set<string>();
    for (const ref of references) {
        const parsed = parseReference(ref);
        if (parsed.filePath) {
            files.add(parsed.filePath);
        }
    }
    return Array.from(files);
}

function classifyReference(filePath: string): 'P0' | 'P1' | 'P2' {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (
        normalized.startsWith('src/') ||
        normalized.startsWith('backend/app/') ||
        normalized.startsWith('frontend/src/')
    ) {
        return 'P0';
    }
    if (
        normalized === 'package.json' ||
        normalized.endsWith('/package.json') ||
        normalized.endsWith('/dockerfile') ||
        normalized.endsWith('/makefile') ||
        /\.config\.[^.]+$/i.test(normalized)
    ) {
        return 'P1';
    }
    return 'P2';
}

function splitReferencesByTier(references: string[]): { p0: string[]; p1: string[]; p2: string[] } {
    const out = { p0: [] as string[], p1: [] as string[], p2: [] as string[] };
    for (const ref of references) {
        const filePath = parseReference(ref).filePath;
        const tier = classifyReference(filePath);
        if (tier === 'P0') {
            out.p0.push(ref);
        } else if (tier === 'P1') {
            out.p1.push(ref);
        } else {
            out.p2.push(ref);
        }
    }
    return {
        p0: Array.from(new Set(out.p0)),
        p1: Array.from(new Set(out.p1)),
        p2: Array.from(new Set(out.p2))
    };
}

function inferSystemName(result: ResearchResult, workspacePath?: string): string {
    if (workspacePath) {
        const name = path.basename(workspacePath).trim();
        if (name) {
            return name;
        }
    }
    const queryPathMatch = result.query.match(/\/[^\s]+/);
    if (queryPathMatch) {
        const name = path.basename(queryPathMatch[0]).trim();
        if (name) {
            return name;
        }
    }
    return 'this system';
}

function pickDiagrams(diagrams?: string[]): { architectureDiagram?: string; dataFlowDiagram?: string } {
    const valid = (diagrams ?? []).filter(Boolean);
    if (valid.length === 0) {
        return {};
    }
    return {
        architectureDiagram: valid[0],
        dataFlowDiagram: valid[1] ?? valid[0]
    };
}

/** 从 references 生成 2～3 层深度的目录树（纯文本）。 */
function buildKeyFileStructureTree(references: string[], maxDepth: number = 3): string[] {
    const root: Record<string, unknown> = {};
    const addPath = (parts: string[]) => {
        let current: Record<string, unknown> = root;
        const limit = Math.min(parts.length, maxDepth);
        for (let i = 0; i < limit; i++) {
            const key = parts[i];
            if (!key) continue;
            const isLast = i === limit - 1;
            if (!(key in current)) {
                current[key] = isLast ? true : {};
            }
            if (current[key] !== true && typeof current[key] === 'object' && current[key] !== null) {
                current = current[key] as Record<string, unknown>;
            }
        }
    };
    const files = getRelevantSourceFiles(references).slice(0, 30);
    for (const file of files) {
        const parts = file.replace(/\\/g, '/').split('/').filter(Boolean);
        addPath(parts);
    }
    const lines: string[] = [];
    const emit = (obj: Record<string, unknown>, prefix: string) => {
        const keys = Object.keys(obj).sort();
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const isLast = i === keys.length - 1;
            const branch = isLast ? '└── ' : '├── ';
            lines.push(prefix + branch + k);
            const child = obj[k];
            if (child && typeof child === 'object' && child !== null && !Array.isArray(child)) {
                const nextPrefix = prefix + (isLast ? '    ' : '│   ');
                emit(child as Record<string, unknown>, nextPrefix);
            }
        }
    };
    emit(root, '');
    return lines;
}

export function renderMarkdownReport(result: ResearchResult, workspacePath?: string): string {
    const lines: string[] = [];
    const relevantFiles = getRelevantSourceFiles(result.references).slice(0, 16);
    const systemName = inferSystemName(result, workspacePath);
    const { architectureDiagram, dataFlowDiagram } = pickDiagrams(result.diagrams);
    const findings = result.architectureFindings ?? [];
    const moduleSummaries = result.moduleSummaries ?? [];
    const flows = result.criticalFlows ?? [];
    const risks = result.risks ?? [];
    const unknowns = result.unknowns ?? [];

    lines.push('# CoraWiki Research Report');
    lines.push('');
    lines.push(`- Query: ${result.query}`);
    lines.push(`- Started At: ${result.startedAt}`);
    lines.push(`- Ended At: ${result.endedAt}`);
    if (result.debugLogPath) {
        lines.push(`- Debug Log: ${result.debugLogPath}`);
    }
    if (result.tokenUsage) {
        lines.push(
            `- Token Usage: prompt=${result.tokenUsage.promptTokens}, completion=${result.tokenUsage.completionTokens}, total=${result.tokenUsage.totalTokens}, cached=${result.tokenUsage.cachedTokens}`
        );
    }
    lines.push('');

    // 1. What is — project background, goals, audience (from LLM's projectBackground or fallback)
    lines.push(`## What is ${systemName}?`);
    lines.push('');
    const whatIsText = result.projectBackground
        || (result.finalConclusion ? result.finalConclusion.slice(0, 400) : `${systemName} is the target system analyzed in this report.`);
    lines.push(whatIsText);
    if (moduleSummaries.length > 0) {
        lines.push('');
        lines.push('主要功能与模块概览：');
        for (const item of moduleSummaries.slice(0, 8)) {
            lines.push(`- ${item}`);
        }
    }
    lines.push('');

    // 2. Overview — technical architecture, tech stack, capability boundaries
    const overviewText = result.technicalOverview
        || (result.finalConclusion
            ? (result.finalConclusion.slice(0, 200).trim() + (result.finalConclusion.length > 200 ? '…' : ''))
            : '(empty)');
    lines.push('## Overview');
    lines.push('');
    lines.push(overviewText);
    lines.push('');

    // 3. System Architecture Overview — 简短架构摘要 + mermaid 图 + Key Code Entities
    lines.push('## System Architecture Overview');
    lines.push('');
    if (findings.length > 0) {
        const lead = findings.slice(0, 2).map(f => `**${f.title}**：${f.judgement.slice(0, 120)}${f.judgement.length > 120 ? '…' : ''}`).join(' ');
        lines.push(`架构上主要特点：${lead}`);
        lines.push('');
    } else if (moduleSummaries.length > 0) {
        const lead = moduleSummaries.slice(0, 4).join('；');
        lines.push(`主要模块与职责：${lead}`);
        lines.push('');
    }
    if (architectureDiagram) {
        lines.push('```mermaid');
        lines.push(architectureDiagram);
        lines.push('```');
    } else {
        lines.push('- (No architecture diagram identified)');
    }
    lines.push('');
    lines.push('### Key Code Entities');
    lines.push('');
    if (findings.length > 0) {
        for (const f of findings.slice(0, 10)) {
            lines.push(`- **${f.title}**: ${f.judgement}`);
            for (const ev of f.evidence.slice(0, 2)) {
                lines.push(`  - ${ev}`);
            }
        }
    } else if (moduleSummaries.length > 0) {
        for (const item of moduleSummaries.slice(0, 8)) {
            lines.push(`- ${item}`);
        }
    } else {
        lines.push('- (No key code entities extracted)');
    }
    lines.push('');

    // 4. Core Components — 二/三级标题分模块
    lines.push('## Core Components');
    lines.push('');
    if (moduleSummaries.length > 0 || findings.length > 0) {
        if (moduleSummaries.length > 0) {
            lines.push('### Module Responsibilities');
            lines.push('');
            for (const item of moduleSummaries) {
                lines.push(`- ${item}`);
            }
            lines.push('');
        }
        if (flows.length > 0) {
            lines.push('### Critical Flows');
            lines.push('');
            for (const flow of flows.slice(0, 5)) {
                lines.push(`- **${flow.name}**: ${flow.steps.join(' → ')}`);
                for (const ev of flow.evidence.slice(0, 2)) {
                    lines.push(`  - ${ev}`);
                }
            }
            lines.push('');
        }
        if (findings.length > 0) {
            lines.push('### Architecture Findings');
            lines.push('');
            for (const f of findings.slice(0, 8)) {
                lines.push(`- **${f.title}**: ${f.judgement}`);
            }
        }
    } else {
        lines.push('- (No core components extracted)');
    }
    lines.push('');

    // 5. Data Flow — mermaid 数据流图
    lines.push('## Data Flow');
    lines.push('');
    if (dataFlowDiagram) {
        lines.push('```mermaid');
        lines.push(dataFlowDiagram);
        lines.push('```');
    } else {
        lines.push('- (No data flow diagram identified)');
    }
    lines.push('');

    // 6. Key File Structure — 树形 2～3 层（放入代码块以保证预览中等宽与对齐）
    lines.push('## Key File Structure');
    lines.push('');
    const treeLines = buildKeyFileStructureTree(result.references);
    if (treeLines.length === 0) {
        lines.push('- (No core files identified)');
    } else {
        lines.push('```');
        for (const line of treeLines) {
            lines.push(line);
        }
        lines.push('```');
    }
    lines.push('');

    // 7. Risks & Unknowns
    if (risks.length > 0 || unknowns.length > 0) {
        lines.push('## Risks & Unknowns');
        lines.push('');
        if (risks.length > 0) {
            for (const r of risks.slice(0, 5)) {
                lines.push(`- **风险**: ${r.risk}（${r.impact}）`);
                for (const ev of r.evidence.slice(0, 2)) {
                    lines.push(`  - ${ev}`);
                }
            }
        }
        if (unknowns.length > 0) {
            for (const u of unknowns.slice(0, 5)) {
                lines.push(`- **待澄清**: ${u}`);
            }
        }
        lines.push('');
    }
    lines.push('---');
    lines.push('分析报告产出来自于 Cora');
    lines.push('');
    return lines.join('\n');
}

export async function saveReport(
    workspacePath: string,
    markdown: string,
    now: Date = new Date()
): Promise<string> {
    const reportDir = path.join(workspacePath, '.cora', 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    const filePath = path.join(reportDir, makeTimestampFileName(now));
    await fs.writeFile(filePath, markdown, 'utf8');
    return filePath;
}

export async function findLatestReportPath(workspacePath: string): Promise<string | undefined> {
    const reportDir = path.join(workspacePath, '.cora', 'reports');
    try {
        const entries = await fs.readdir(reportDir, { withFileTypes: true });
        const mdFiles = entries
            .filter(e => e.isFile() && e.name.endsWith('.md'))
            .map(e => e.name)
            .sort((a, b) => b.localeCompare(a));
        if (mdFiles.length === 0) {
            return undefined;
        }
        return path.join(reportDir, mdFiles[0]);
    } catch {
        return undefined;
    }
}

