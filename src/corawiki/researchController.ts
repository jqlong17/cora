import * as path from 'path';
import * as fs from 'fs/promises';
import {
    listDir,
    readFullCode,
    readSkeleton,
    discoverEntrypoints,
    analyzeDependencies,
    summarizeDirectory,
    runPythonTool
} from './tools';
import { chatWithTools, createLLMClient, type ToolSpec } from './llmClient';
import type { CoraWikiLLMConfig, ResearchResult, ResearchStep } from './types';
import { buildCodeTree } from './treeBuilder';
import { loadCachedTree, saveCachedTree } from './cacheStore';
import { repairTree, verifyTree } from './treeValidator';
import { ResearchLogger } from './researchLogger';

/** 用户选择跳过 Python 或重试 */
export type OnPythonErrorChoice = 'skip' | 'retry';

export interface RunResearchOptions {
    maxSteps?: number;
    llmConfig?: CoraWikiLLMConfig;
    include?: string[];
    exclude?: string[];
    cacheTtlSec?: number;
    maxTotalTokens?: number;
    onProgress?: (message: string) => void;
    /** 当用户终止分析时 abort；run 会 reject 或抛出包含 CANCELLED 的错 */
    signal?: AbortSignal;
    /** 启用后可调用 extract_import_graph、analyze_complexity 等 Python 工具；默认 true，无 Python 时可由用户跳过 */
    enablePythonTooling?: boolean;
    /** Python 解释器路径，如 python3 */
    pythonPath?: string;
    /** 扩展安装目录，用于定位 corawiki-pytools/runner.py */
    extensionPath?: string;
    /** Python 执行出错时由命令层弹窗，返回用户选择：跳过则本 run 内不再用 Python */
    onPythonError?: (error: string, phase: 'prerun' | 'tool') => Promise<OnPythonErrorChoice>;
}

function createStep(
    iteration: number,
    stage: ResearchStep['stage'],
    action: string,
    input: string,
    evidence: string[],
    output: string
): ResearchStep {
    return { iteration, stage, action, input, evidence, output };
}

// Keep provider-specific fields on assistant tool_call payload
// (e.g. Kimi `reasoning_content`) to avoid follow-up request validation errors.
export function appendAssistantToolCallMessage(messages: any[], message: any): void {
    messages.push(message);
}

/** 从 API 返回的 message 中提取推理/思考内容（如 Kimi reasoning_content 或 content 中的 reasoning 块）。 */
function extractReasoningFromMessage(msg: any): string | undefined {
    if (!msg || typeof msg !== 'object') return undefined;
    if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
        return msg.reasoning_content.trim();
    }
    const content = msg.content;
    if (Array.isArray(content)) {
        for (const block of content) {
            if (block && typeof block === 'object' && (block.type === 'reasoning' || block.type === 'thinking') && typeof block.text === 'string') {
                return block.text.trim();
            }
        }
    }
    return undefined;
}

export const CORAWIKI_CANCELLED = 'CORAWIKI_CANCELLED';
const CORAWIKI_PROMPT_VERSION = 'v2-evidence-priority';

/** Root-level files that the LLM agent should always be able to read without prior list_dir discovery. */
export const ROOT_WHITELIST_PATTERNS: RegExp[] = [
    /^readme([._-][a-z_-]+)?\.md$/i,
    /^package\.json$/i,
    /^tsconfig([._-][a-z_-]+)?\.json$/i,
    /^dockerfile$/i,
    /^makefile$/i,
    /^license$/i,
    /^changelog([._-][a-z_-]+)?\.md$/i,
    /^\.env\.example$/i,
    /^pyproject\.toml$/i,
    /^cargo\.toml$/i,
    /^go\.mod$/i,
];

type ReferenceStats = {
    p0: number;
    p1: number;
    p2: number;
    sourceEvidenceRatio: number;
    docNoiseRatio: number;
};

export class ResearchController {
    private readonly maxSteps: number;
    private readonly llmConfig?: CoraWikiLLMConfig;
    private readonly include: string[];
    private readonly exclude: string[];
    private readonly cacheTtlSec: number;
    private readonly maxTotalTokens: number;
    private readonly onProgress?: (message: string) => void;
    private readonly signal?: AbortSignal;
    private readonly enablePythonTooling: boolean;
    private readonly pythonPath: string;
    private readonly extensionPath?: string;
    private readonly onPythonError?: (error: string, phase: 'prerun' | 'tool') => Promise<OnPythonErrorChoice>;
    /** 本 run 内用户已选择跳过 Python，不再弹窗、直接返回友好说明 */
    private pythonSkippedForThisRun = false;

    constructor(options: RunResearchOptions = {}) {
        this.maxSteps = options.maxSteps ?? 15;
        this.llmConfig = options.llmConfig;
        this.include = options.include ?? [];
        this.exclude = options.exclude ?? ['.git', 'node_modules', 'dist', 'build'];
        this.cacheTtlSec = options.cacheTtlSec ?? 30;
        this.maxTotalTokens = options.maxTotalTokens ?? 100000;
        this.onProgress = options.onProgress;
        this.signal = options.signal;
        this.enablePythonTooling = options.enablePythonTooling ?? true;
        this.pythonPath = options.pythonPath ?? 'python3';
        this.extensionPath = options.extensionPath;
        this.onPythonError = options.onPythonError;
    }

    private throwIfAborted(): void {
        if (this.signal?.aborted) {
            const err = new Error('CoraWiki research cancelled');
            (err as any).code = CORAWIKI_CANCELLED;
            throw err;
        }
    }

    async run(query: string, workspacePath: string): Promise<ResearchResult> {
        if (this.llmConfig?.apiKey) {
            return this.runWithLLM(query, workspacePath);
        }
        return this.runLocal(query, workspacePath);
    }

    private async runLocal(query: string, workspacePath: string): Promise<ResearchResult> {
        this.throwIfAborted();
        const startedAt = new Date().toISOString();
        const steps: ResearchStep[] = [];
        this.emitProgress(`正在准备代码树：${path.basename(workspacePath) || workspacePath}`);

        let codeTree = await loadCachedTree(workspacePath, this.cacheTtlSec);
        let treeSource = 'cache';
        if (!codeTree) {
            codeTree = await buildCodeTree(workspacePath, {
                include: this.include,
                exclude: this.exclude
            });
            await saveCachedTree(workspacePath, codeTree);
            treeSource = 'build';
        }

        const validation = verifyTree(codeTree);
        if (!validation.ok) {
            codeTree = repairTree(codeTree);
        }

        const rootEvidence = codeTree.children.slice(0, 10).map(node => node.path);
        steps.push(
            createStep(
                1,
                'PLAN',
                'build_code_tree',
                workspacePath,
                rootEvidence,
                `代码树已准备完成（source=${treeSource}, nodes=${codeTree.children.length}, valid=${validation.ok}）。`
            )
        );

        const rootEntries = await listDir(workspacePath, { maxEntries: 200 });
        this.emitProgress('正在分析目录结构并提取候选文件');
        const fileCandidates = rootEntries
            .filter(entry => entry.type === 'file' && /\.(ts|js|md)$/.test(entry.name))
            .map(entry => entry.path);

        const srcDir = path.join(workspacePath, 'src');
        let srcEvidence: string[] = [];
        try {
            srcEvidence = (await listDir(srcDir, { maxEntries: 50 }))
                .map(item => item.path)
                .filter(Boolean);
        } catch {
            srcEvidence = [];
        }

        const plan = `围绕问题“${query}”进行三阶段研究：先定位候选目录与文件，再抽取骨架信息，最后给出结论与证据引用。`;
        steps.push(createStep(2, 'PLAN', 'list_dir', workspacePath, srcEvidence.slice(0, 10), plan));

        const updates: string[] = [];
        let references: string[] = [];

        if (this.maxSteps > 1 && srcEvidence.length > 0) {
            const firstEvidence = srcEvidence[0];
            try {
                this.emitProgress(`正在读取骨架：${path.basename(firstEvidence)}`);
                const skeleton = await readSkeleton(firstEvidence);
                const update = `读取骨架：${path.basename(firstEvidence)}，提取到 ${skeleton.imports.length} 条 import，${skeleton.symbols.length} 个符号声明。`;
                updates.push(update);
                references = [skeleton.filePath];
                steps.push(createStep(3, 'UPDATE', 'read_skeleton', firstEvidence, [skeleton.filePath], update));
            } catch {
                const update = `尝试读取骨架失败：${firstEvidence}。将改用目录证据生成初步结论。`;
                updates.push(update);
                steps.push(createStep(3, 'UPDATE', 'read_skeleton', firstEvidence, [firstEvidence], update));
            }
        }

        if (this.maxSteps > 2 && fileCandidates.length > 0) {
            try {
                this.emitProgress(`正在读取源码片段：${path.basename(fileCandidates[0])}`);
                const snippet = await readFullCode(fileCandidates[0], { startLine: 1, endLine: 60 });
                const short = snippet.split('\n').slice(0, 3).join(' | ');
                const update = `读取源码片段：${path.basename(fileCandidates[0])}，片段摘要：${short}`;
                updates.push(update);
                references.push(fileCandidates[0]);
                steps.push(createStep(4, 'UPDATE', 'read_full_code', fileCandidates[0], [fileCandidates[0]], update));
            } catch {
                // ignore source read failures in MVP
            }
        }

        const uniqueRefs = Array.from(new Set(references));
        const finalConclusion = uniqueRefs.length > 0
            ? `已完成最小闭环研究，基于 ${uniqueRefs.length} 个证据文件形成结论。下一步建议接入真实 Tool Calling 循环与模型推理。`
            : '已完成最小闭环研究，但暂未获取足够文件证据。建议检查工作区路径或 include/exclude 配置。';

        steps.push(createStep(steps.length + 1, 'FINAL', 'finalize', query, uniqueRefs, finalConclusion));
        this.emitProgress('本地研究完成，正在整理结论');

        return {
            query,
            startedAt,
            endedAt: new Date().toISOString(),
            steps,
            plan,
            updates,
            finalConclusion,
            references: uniqueRefs
        };
    }

    private async runWithLLM(query: string, workspacePath: string): Promise<ResearchResult> {
        const startedAt = new Date().toISOString();
        const steps: ResearchStep[] = [];
        const updates: string[] = [];
        const references = new Set<string>();
        let plan = '';
        let finalConclusion = '';
        let projectBackground = '';
        let technicalOverview = '';
        const diagrams: string[] = [];
        const moduleSummaries: string[] = [];
        const architectureFindings: Array<{ title: string; judgement: string; evidence: string[] }> = [];
        const criticalFlows: Array<{ name: string; steps: string[]; evidence: string[] }> = [];
        const risks: Array<{ risk: string; impact: string; evidence: string[] }> = [];
        const unknowns: string[] = [];
        const discoveredFiles = new Set<string>();
        const discoveredDirs = new Set<string>([workspacePath]);
        await this.injectRootWhitelistFiles(workspacePath, discoveredFiles);
        const tokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cachedTokens: 0
        };
        let apiRequestCount = 0;
        let toolCallCount = 0;
        this.throwIfAborted();
        const logger = await ResearchLogger.create(workspacePath);
        this.emitProgress('Agent 已启动，正在建立研究上下文');
        const debugLogPath = logger.getPath();
        await this.tryLog(logger, 'run_start', {
            query,
            workspacePath,
            provider: this.llmConfig?.provider,
            model: this.llmConfig?.model,
            promptVersion: CORAWIKI_PROMPT_VERSION,
            startedAt
        });

        const llm = createLLMClient(this.llmConfig!);
        const tools: ToolSpec[] = [
            {
                type: 'function',
                function: {
                    name: 'list_dir',
                    description: '列出某个目录下的文件与子目录',
                    parameters: {
                        type: 'object',
                        properties: {
                            targetPath: { type: 'string', description: '目标目录路径' }
                        },
                        required: ['targetPath']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'read_skeleton',
                    description: '读取代码文件骨架（imports 与 symbols）',
                    parameters: {
                        type: 'object',
                        properties: {
                            filePath: { type: 'string', description: '代码文件路径' }
                        },
                        required: ['filePath']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'read_full_code',
                    description: '读取代码文件内容',
                    parameters: {
                        type: 'object',
                        properties: {
                            filePath: { type: 'string', description: '代码文件路径' },
                            startLine: { type: 'number', description: '起始行号（可选）' },
                            endLine: { type: 'number', description: '结束行号（可选）' }
                        },
                        required: ['filePath']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'discover_entrypoints',
                    description: '扫描项目常见入口文件（main.py, app.py, server.ts, index.ts, API 路由等）',
                    parameters: {
                        type: 'object',
                        properties: {
                            root: { type: 'string', description: '扫描根目录路径' }
                        },
                        required: ['root']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'analyze_dependencies',
                    description: '分析指定文件的 import/require，区分工作区内本地依赖与外部依赖',
                    parameters: {
                        type: 'object',
                        properties: {
                            filePaths: { type: 'array', items: { type: 'string' }, description: '待分析文件路径列表' },
                            workspacePath: { type: 'string', description: '工作区根路径' }
                        },
                        required: ['filePaths', 'workspacePath']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'summarize_directory',
                    description: '统计目录下的文件数、子目录数、代码文件数、Markdown 数、配置文件数',
                    parameters: {
                        type: 'object',
                        properties: {
                            targetPath: { type: 'string', description: '目标目录路径' }
                        },
                        required: ['targetPath']
                    }
                }
            },
            ...(this.enablePythonTooling
                ? [
                    {
                        type: 'function' as const,
                        function: {
                            name: 'extract_import_graph',
                            description: '从指定文件提取 import/require 图（Python ast / JS/TS regex），区分本地依赖与外部依赖',
                            parameters: {
                                type: 'object' as const,
                                properties: {
                                    filePaths: { type: 'array' as const, items: { type: 'string' as const }, description: '待分析文件路径列表' },
                                    workspacePath: { type: 'string' as const, description: '工作区根路径' }
                                },
                                required: ['filePaths', 'workspacePath']
                            }
                        }
                    },
                    {
                        type: 'function' as const,
                        function: {
                            name: 'analyze_complexity',
                            description: '分析指定 Python 文件的圈复杂度与可维护性指数（需安装 radon 可获得完整指标）',
                            parameters: {
                                type: 'object' as const,
                                properties: {
                                    filePaths: { type: 'array' as const, items: { type: 'string' as const }, description: '待分析文件路径列表（建议 .py）' },
                                    workspacePath: { type: 'string' as const, description: '工作区根路径' }
                                },
                                required: ['filePaths', 'workspacePath']
                            }
                        }
                    }
                ]
                : [])
        ];

        const messages: any[] = [
            {
                role: 'system',
                content:
                    '你是 CoraWiki 的代码架构研究 Agent（promptVersion=v2-evidence-priority）。' +
                    '可用工具：list_dir, read_skeleton, read_full_code, discover_entrypoints, analyze_dependencies, summarize_directory' +
                    (this.enablePythonTooling ? ', extract_import_graph, analyze_complexity（Python 工具）' : '') + '。\n' +
                    '【效率要求——极其重要】你只有 10 轮工具调用机会，每轮可以**并行调用多个工具**（在同一轮返回多个 tool_calls）。' +
                    '为了最大化效率，你**必须**在每轮同时调用 3-5 个工具，而不是每轮只调 1-2 个。' +
                    '例如第 1 轮应同时调用：read_full_code(README.md) + read_full_code(package.json) + discover_entrypoints(root) + summarize_directory(src)。' +
                    '**禁止**在一轮中只调用 list_dir；list_dir 应与 read_skeleton/read_full_code **并行调用**。\n' +
                    '【重要-前 2 轮必做】在前 2 轮内，你**必须**使用 read_full_code 读取根目录下的 README.md（或 README_EN.md）以及 package.json（已在白名单中，无需 list_dir 先发现）。' +
                    '这两个文件提供项目的业务背景、目标受众与核心依赖信息，是 FINAL 中 projectBackground 和 technicalOverview 的主要来源。\n' +
                    '建议先用 discover_entrypoints 与 summarize_directory 建立项目概览，再读代码。' +
                    '你必须优先读取运行时代码证据，再输出结论。优先使用 read_skeleton，必要时才调用 read_full_code。' +
                    '读取文件前必须先通过 list_dir 发现该文件路径，禁止猜测不存在路径（根目录白名单文件除外：README*.md, package.json, tsconfig*.json 等）。\n' +
                    '证据分层与配额：P0=运行时代码(src/**, backend/app/**, frontend/src/**)；' +
                    'P1=配置/构建(package.json,Dockerfile,Makefile,*.config.*)；' +
                    'P2=文档/交付( docs/**, EP-*.md, *REPORT*, *SUMMARY* )。' +
                    'FINAL 目标：P0 占比>=60%，P2 占比<=20%。P2 不得作为核心架构结论唯一依据。' +
                    '每个判断必须附 evidence（文件路径或路径+行号）；证据不足时必须写 unknowns，禁止猜测。' +
                    '必须覆盖：Overview、Module Responsibilities、Critical Flows、Key Config、Build Artifacts、Risks、Unknowns。\n' +
                    '【分析深度要求——极其重要】\n' +
                    '你的报告面向的读者是技术决策者（Tech Lead / Architect），他们需要的不是代码文件的罗列，而是对项目的**高层洞察**。请务必做到以下几点：\n' +
                    '1. **projectBackground**：不要简单重复 README 原文，要提炼出项目要解决的核心问题、目标用户、差异化价值主张。\n' +
                    '2. **technicalOverview**：站在架构师视角，阐述技术选型的取舍（为什么选这个框架/库、对比什么方案）、整体分层策略、核心设计模式（如 MVC、Event-Driven、Plugin Architecture 等）。\n' +
                    '3. **architectureFindings**：每条发现必须是一个可讨论的架构判断（如"前后端通过 REST 松耦合但缺乏消息队列缓冲"），不是简单罗列"项目使用了 React"。至少 5 条。\n' +
                    '4. **criticalFlows**：选择最能体现系统设计复杂度的核心业务流程（如：用户登录鉴权链路、数据从前端到持久化的完整路径、核心调度/编排流程），每条至少 5 步。至少 2 条。\n' +
                    '5. **moduleSummaries**：不要只写目录名，要写出每个模块的职责、它对外暴露的核心接口或能力、它与其他模块的依赖关系。\n' +
                    '6. **risks**：必须是技术风险（如"单点故障"、"缺乏监控"、"无数据库 migration"），不是管理风险。\n' +
                    '【热点模块深入】若预分析中提供了【热点模块扫描】信息，你**必须**对文件数排名前 5 的模块至少各执行 1 次 read_skeleton 或 summarize_directory。\n' +
                    '【架构图要求】diagrams 字段**必须**基于你实际阅读的代码生成，反映真实的模块依赖、组件交互或数据流向。' +
                    '**禁止**返回简单的 User→UI→API→Service→Data 万能分层图或自然语言文本。' +
                    '至少提供 2 条 Mermaid 源码：(1) High-Level Component Architecture（标注实际模块名与依赖方向）(2) Core Business Flow（选一个关键业务流程画 sequence 或 flowchart）。\n' +
                    '若首轮 user 消息末尾包含【预分析】或【预分析-降级】，请优先基于该结果决定首轮动作：先调用 discover_entrypoints 或 summarize_directory 建立概览，再对关键文件使用 read_skeleton，不要仅用 list_dir 逐层展开。'
            },
            {
                role: 'user',
                content:
                    `工作区: ${workspacePath}\n问题: ${query}\n` +
                    '可调用 list_dir, read_skeleton, read_full_code, discover_entrypoints, analyze_dependencies, summarize_directory。' +
                    '建议先用 discover_entrypoints 与 summarize_directory 建立项目概览，再读代码，最后输出 FINAL。'
            }
        ];

        let prerunIncluded = false;
        if (
            this.enablePythonTooling &&
            this.extensionPath &&
            !this.pythonSkippedForThisRun
        ) {
            const prerunFilePaths: string[] = [];
            const entries = await discoverEntrypoints(workspacePath);
            for (const e of entries.slice(0, 15)) {
                prerunFilePaths.push(e.filePath);
            }
            if (prerunFilePaths.length < 15) {
                const rootEntries = await listDir(workspacePath, { maxEntries: 50 });
                const codeExt = /\.(py|ts|js|tsx|jsx|mjs|cjs)$/i;
                for (const entry of rootEntries) {
                    if (entry.type === 'file' && codeExt.test(entry.path) && !prerunFilePaths.includes(entry.path)) {
                        prerunFilePaths.push(entry.path);
                        if (prerunFilePaths.length >= 20) break;
                    }
                }
            }
            const toRun = prerunFilePaths.slice(0, 20);
            if (toRun.length > 0) {
                let importResult: { ok: true; result: unknown } | { ok: false; error: string } = await runPythonTool(
                    this.extensionPath,
                    this.pythonPath,
                    'extract_import_graph',
                    { filePaths: toRun, workspacePath },
                    workspacePath
                );
                if (!importResult.ok && this.onPythonError) {
                    const choice = await this.onPythonError(importResult.error, 'prerun');
                    if (choice === 'skip') {
                        this.pythonSkippedForThisRun = true;
                    } else if (choice === 'retry') {
                        importResult = await runPythonTool(
                            this.extensionPath,
                            this.pythonPath,
                            'extract_import_graph',
                            { filePaths: toRun, workspacePath },
                            workspacePath
                        );
                    }
                }
                let complexityResult: { ok: true; result: unknown } | { ok: false; error: string } = await runPythonTool(
                    this.extensionPath,
                    this.pythonPath,
                    'analyze_complexity',
                    { filePaths: toRun.filter(p => p.toLowerCase().endsWith('.py')), workspacePath },
                    workspacePath
                );
                if (!complexityResult.ok && this.onPythonError && !this.pythonSkippedForThisRun) {
                    const choice = await this.onPythonError(complexityResult.error, 'prerun');
                    if (choice === 'skip') {
                        this.pythonSkippedForThisRun = true;
                    } else if (choice === 'retry') {
                        complexityResult = await runPythonTool(
                            this.extensionPath,
                            this.pythonPath,
                            'analyze_complexity',
                            { filePaths: toRun.filter(p => p.toLowerCase().endsWith('.py')), workspacePath },
                            workspacePath
                        );
                    }
                }
                if (!this.pythonSkippedForThisRun && (importResult.ok || complexityResult.ok)) {
                    const parts: string[] = ['\n【预分析】已用 Python 工具跑过部分文件的依赖与复杂度，结果如下；如需某块更细可再调 extract_import_graph/analyze_complexity。'];
                    if (importResult.ok && Array.isArray(importResult.result)) {
                        const arr = importResult.result as Array<{ filePath?: string; imports?: string[]; localDeps?: string[]; externalDeps?: string[] }>;
                        const summary = arr.slice(0, 10).map(x =>
                            `${x.filePath ?? ''}: imports=${x.imports?.length ?? 0} local=${x.localDeps?.length ?? 0} external=${x.externalDeps?.length ?? 0}`
                        ).join('\n');
                        parts.push(`【extract_import_graph】\n${summary}`);
                        for (const r of arr) {
                            if (r.filePath) discoveredFiles.add(r.filePath);
                            const dir = path.dirname(r.filePath ?? '');
                            if (dir) discoveredDirs.add(dir);
                        }
                    }
                    if (complexityResult.ok && Array.isArray(complexityResult.result)) {
                        const arr = complexityResult.result as Array<{ filePath?: string; complexity?: unknown[]; maintainability_index?: number }>;
                        const summary = arr.slice(0, 10).map(x =>
                            `${x.filePath ?? ''}: complexity_blocks=${x.complexity?.length ?? 0} mi=${x.maintainability_index ?? '-'}`
                        ).join('\n');
                        parts.push(`【analyze_complexity】\n${summary}`);
                        for (const r of arr) {
                            if (r.filePath) discoveredFiles.add(r.filePath);
                        }
                    }
                    for (const dir of ['backend/app', 'backend', 'frontend/src', 'src']) {
                        const full = path.join(workspacePath, dir);
                        try {
                            const st = await fs.stat(full);
                            if (st.isDirectory()) {
                                const sum = await summarizeDirectory(full);
                                parts.push(`【目录概览】${dir}: files=${sum.fileCount}, dirs=${sum.dirCount}, codeFiles=${sum.codeFiles}`);
                            }
                        } catch {
                            // directory does not exist, skip
                        }
                    }
                    const hotspotResult = await this.scanHotspotModules(workspacePath);
                    if (hotspotResult.summary) {
                        parts.push(hotspotResult.summary);
                    }
                    if (hotspotResult.indexFiles.length > 0) {
                        const skeletonResults: string[] = [];
                        for (const idxFile of hotspotResult.indexFiles.slice(0, 5)) {
                            try {
                                const skeleton = await readSkeleton(idxFile);
                                discoveredFiles.add(idxFile);
                                discoveredDirs.add(path.dirname(idxFile));
                                this.autoDiscoverImportedFiles(skeleton.imports, idxFile, workspacePath, discoveredFiles, discoveredDirs);
                                const relPath = path.relative(workspacePath, idxFile);
                                const imports = skeleton.imports.slice(0, 15);
                                const symbols = skeleton.symbols.slice(0, 20);
                                skeletonResults.push(
                                    `  ${relPath}: imports(${skeleton.imports.length})=[${imports.join(', ')}] symbols(${skeleton.symbols.length})=[${symbols.join(', ')}]`
                                );
                            } catch { /* skip unreadable */ }
                        }
                        if (skeletonResults.length > 0) {
                            parts.push(`【热点模块预读】已自动对 ${skeletonResults.length} 个热点模块入口执行 read_skeleton：\n${skeletonResults.join('\n')}\n你不需要再对这些文件执行 read_skeleton，应直接深入其 imports 中的关键文件。`);
                        }
                    }
                    const suggestPaths = toRun.filter(p =>
                        /(?:backend\/app|frontend\/src|main\.py|app\.py|\/src\/)/.test(p)
                    ).slice(0, 3);
                    const suggestLine = suggestPaths.length > 0
                        ? `【建议】首轮至少执行其一：read_skeleton(${suggestPaths.join(')、read_skeleton(')})、summarize_directory(backend/app) 或 summarize_directory(frontend/src)。`
                        : '【建议】首轮至少执行其一：summarize_directory(backend/app)、summarize_directory(frontend/src) 或 discover_entrypoints(root)，再对关键文件 read_skeleton。';
                    parts.push(suggestLine);
                    prerunIncluded = true;
                    const userMsg = messages[1];
                    if (userMsg && typeof userMsg.content === 'string') {
                        userMsg.content = userMsg.content + parts.join('\n');
                    }
                }
            }
        }
        if (typeof messages[1]?.content === 'string' && !messages[1].content.includes('【预分析】')) {
            const rootSummary = await summarizeDirectory(workspacePath);
            const entries = await discoverEntrypoints(workspacePath);
            const entryPaths = entries.slice(0, 10).map(e => e.filePath).join(', ') + (entries.length > 10 ? '...' : '');
            const fallback = `\n【预分析-降级】项目根目录: files=${rootSummary.fileCount}, dirs=${rootSummary.dirCount}, codeFiles=${rootSummary.codeFiles}；入口文件: ${entryPaths}`;
            const hotspotResult = await this.scanHotspotModules(workspacePath);
            let hotspotText = hotspotResult.summary ? '\n' + hotspotResult.summary : '';
            if (hotspotResult.indexFiles.length > 0) {
                const skeletonResults: string[] = [];
                for (const idxFile of hotspotResult.indexFiles.slice(0, 5)) {
                    try {
                        const skeleton = await readSkeleton(idxFile);
                        discoveredFiles.add(idxFile);
                        discoveredDirs.add(path.dirname(idxFile));
                        this.autoDiscoverImportedFiles(skeleton.imports, idxFile, workspacePath, discoveredFiles, discoveredDirs);
                        const relPath = path.relative(workspacePath, idxFile);
                        const imports = skeleton.imports.slice(0, 15);
                        const symbols = skeleton.symbols.slice(0, 20);
                        skeletonResults.push(
                            `  ${relPath}: imports(${skeleton.imports.length})=[${imports.join(', ')}] symbols(${skeleton.symbols.length})=[${symbols.join(', ')}]`
                        );
                    } catch { /* skip */ }
                }
                if (skeletonResults.length > 0) {
                    hotspotText += `\n【热点模块预读】已自动对 ${skeletonResults.length} 个热点模块入口执行 read_skeleton：\n${skeletonResults.join('\n')}\n你不需要再对这些文件执行 read_skeleton，应直接深入其 imports 中的关键文件。`;
                }
            }
            messages[1].content = messages[1].content + fallback + hotspotText;
            prerunIncluded = true;
        }

        let budgetHit = false;
        let finalRetryCount = 0;
        let lastRoundToolNames: string[] = [];
        let remediationRounds = 0;
        let consecutiveListDirRounds = 0;
        const alreadyReadFiles = new Set<string>();
        for (let iteration = 1; iteration <= this.maxSteps; iteration++) {
            this.throwIfAborted();
            this.emitProgress(`第 ${iteration}/${this.maxSteps} 轮：正在决策下一步`);
            let iterationTools = tools;
            if (consecutiveListDirRounds >= 2 && iteration >= 3) {
                iterationTools = tools.filter(t => t.function.name !== 'list_dir');
            }
            const contextMessages = this.buildContextMessages(
                messages,
                updates,
                Array.from(references),
                iteration,
                this.maxSteps,
                tokenUsage.totalTokens,
                this.maxTotalTokens,
                iterationTools,
                lastRoundToolNames,
                alreadyReadFiles.size
            );
            apiRequestCount += 1;
            await this.tryLog(logger, 'api_request', {
                iteration,
                model: this.llmConfig!.model,
                messages: this.safeForLog(contextMessages),
                tools: this.safeForLog(iterationTools)
            });
            const response = await chatWithTools(llm, {
                model: this.llmConfig!.model,
                messages: contextMessages,
                tools: iterationTools
            }, this.llmConfig);
            await this.tryLog(logger, 'api_response', {
                iteration,
                usage: this.safeForLog(response.usage),
                response: this.safeForLog(response)
            });
            tokenUsage.promptTokens += response.usage?.prompt_tokens ?? 0;
            tokenUsage.completionTokens += response.usage?.completion_tokens ?? 0;
            tokenUsage.totalTokens += response.usage?.total_tokens ?? 0;
            tokenUsage.cachedTokens += (response.usage as any)?.cached_tokens ?? 0;
            if (tokenUsage.totalTokens >= this.maxTotalTokens) {
                budgetHit = true;
                await this.tryLog(logger, 'budget_hit', {
                    iteration,
                    totalTokens: tokenUsage.totalTokens,
                    maxTotalTokens: this.maxTotalTokens
                });
            }
            const msg = response.choices?.[0]?.message as any;
            if (!msg) {
                break;
            }
            const reasoningText = extractReasoningFromMessage(msg);
            if (reasoningText) {
                await this.tryLogReasoning(logger, iteration, reasoningText);
            }
            const decisionContent = (msg.content ?? '').toString().trim();
            const decisionToolNames = (msg.tool_calls || []).map((c: any) => c.function?.name).filter(Boolean);
            await this.tryLogDecision(logger, iteration, decisionContent, decisionToolNames);

            const toolCalls = msg.tool_calls as any[] | undefined;
            if (toolCalls && toolCalls.length > 0) {
                if (budgetHit) {
                    this.emitProgress(`达到 token 预算上限（${tokenUsage.totalTokens}），提前收敛`);
                    finalConclusion = this.buildBudgetFinalConclusion(query, Array.from(references), tokenUsage.totalTokens);
                    steps.push(createStep(
                        iteration,
                        'FINAL',
                        'token_budget_finalize',
                        query,
                        Array.from(references),
                        finalConclusion
                    ));
                    break;
                }
                appendAssistantToolCallMessage(messages, msg);

                const toolCallPromises = toolCalls.map(async (call) => {
                    const fnName = call.function?.name as string;
                    let args: any = {};
                    try {
                        args = JSON.parse(call.function?.arguments ?? '{}');
                    } catch {
                        args = {};
                    }
                    const result = await this.executeTool(
                        fnName,
                        args,
                        workspacePath,
                        discoveredFiles,
                        discoveredDirs,
                        alreadyReadFiles
                    );
                    return { call, fnName, args, result };
                });
                const toolResults = await Promise.all(toolCallPromises);
                this.throwIfAborted();

                for (const { call, fnName, args, result } of toolResults) {
                    toolCallCount += 1;
                    const { rawOutput, contextOutput, evidence } = result;
                    this.emitProgress(
                        `第 ${iteration} 轮：正在调用 ${fnName}${this.formatToolTarget(fnName, args)}`
                    );
                    await this.tryLog(logger, 'tool_call', {
                        iteration,
                        toolName: fnName,
                        args: this.safeForLog(args),
                        rawCall: this.safeForLog(call)
                    });
                    this.emitProgress(`第 ${iteration} 轮：${fnName} 返回 ${evidence.length} 条证据`);
                    await this.tryLog(logger, 'tool_result', {
                        iteration,
                        toolName: fnName,
                        args: this.safeForLog(args),
                        rawOutput,
                        contextOutput,
                        evidence
                    });
                    evidence.forEach(e => references.add(e));
                    updates.push(`[${fnName}] ${contextOutput.slice(0, 240)}`);
                    steps.push(
                        createStep(iteration, 'UPDATE', fnName, JSON.stringify(args), evidence, contextOutput.slice(0, 500))
                    );
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: contextOutput
                    });
                }
                lastRoundToolNames = toolResults.map(r => r.fnName);
                const allListDir = lastRoundToolNames.length > 0 && lastRoundToolNames.every(n => n === 'list_dir');
                consecutiveListDirRounds = allListDir ? consecutiveListDirRounds + 1 : 0;
                continue;
            }

            lastRoundToolNames = [];
            consecutiveListDirRounds = 0;

            const text = (msg.content ?? '').toString().trim();
            if (!text) {
                continue;
            }
            await this.tryLog(logger, 'assistant_text', {
                iteration,
                text
            });

            if (!plan) {
                plan = text;
                this.emitProgress(`第 ${iteration} 轮：已形成研究计划`);
                steps.push(createStep(iteration, 'PLAN', 'llm_plan', query, Array.from(references), text.slice(0, 500)));
            } else {
                const structured = this.tryParseStructuredFinal(text);
                if (structured) {
                    if (structured.status === 'need_more_evidence' && finalRetryCount < 2) {
                        finalRetryCount += 1;
                        const missing = (structured.missingEvidence || []).slice(0, 6).join('；') || '关键模块证据不足';
                        const nextActions = (structured.nextActions || []).slice(0, 4).join('；') || '请继续补读高价值源码文件';
                        this.emitProgress(`第 ${iteration} 轮：证据不足，正在补充检索`);
                        messages.push({ role: 'assistant', content: text });
                        messages.push({
                            role: 'user',
                            content:
                                `你返回了 need_more_evidence。缺失证据：${missing}。` +
                                `建议动作：${nextActions}。` +
                                '请优先补读 P0 运行时代码，再返回 status="ready" 的 FINAL JSON。'
                        });
                        continue;
                    }
                    plan = structured.plan || plan;
                    updates.splice(0, updates.length, ...(structured.updates || updates));
                    finalConclusion = structured.finalConclusion || text;
                    if (structured.projectBackground) { projectBackground = structured.projectBackground; }
                    if (structured.technicalOverview) { technicalOverview = structured.technicalOverview; }
                    (structured.references || []).forEach(ref => references.add(ref));
                    this.normalizeMermaidDiagrams(structured.diagrams || []).forEach(item => diagrams.push(item));
                    (structured.moduleSummaries || []).forEach(item => moduleSummaries.push(item));
                    (structured.architectureFindings || []).forEach(item => architectureFindings.push(item));
                    (structured.criticalFlows || []).forEach(item => criticalFlows.push(item));
                    (structured.risks || []).forEach(item => risks.push(item));
                    (structured.unknowns || []).forEach(item => unknowns.push(item));
                    const quality = this.checkFinalQuality({
                        architectureFindings,
                        criticalFlows,
                        references: Array.from(references),
                        diagrams: this.ensureMinimumDiagrams(diagrams),
                        risks,
                        unknowns,
                        moduleSummaries
                    });
                    if (!quality.ok && finalRetryCount < 1) {
                        finalRetryCount += 1;
                        this.emitProgress(`第 ${iteration} 轮：FINAL 质量未达标，正在补充分析`);
                        messages.push({
                            role: 'assistant',
                            content: text
                        });
                        messages.push({
                            role: 'user',
                            content:
                                '你的 FINAL JSON 质量不足，请补充后重新输出 JSON：' +
                                `问题=${quality.reason}。` +
                                '要求：architectureFindings 至少 3 条；criticalFlows 至少 1 条；每条 finding/risk/flow 都必须有 evidence；' +
                                'diagrams 必须至少 2 条，且每条必须是合法 mermaid 代码（例如 flowchart TD / graph TD），' +
                                'P0 证据占比必须 >=60%，P2 占比必须 <=20%，禁止返回自然语言描述。'
                        });
                        continue;
                    }
                } else {
                    if (iteration < this.maxSteps) {
                        this.emitProgress(`第 ${iteration} 轮：输出非 JSON 格式，要求重新输出 FINAL`);
                        messages.push({ role: 'assistant', content: text });
                        messages.push({
                            role: 'user',
                            content:
                                '**错误**：你输出了非 JSON 格式的文本。请不要输出 Markdown 总结，你**必须**输出结构化 FINAL JSON。' +
                                '如果你认为证据已经充足，请立即输出 FINAL JSON（schema 见系统提示）。' +
                                '如果你认为需要继续调用工具收集证据，请调用工具而不是输出文本。'
                        });
                        continue;
                    }
                    finalConclusion = text;
                }
                this.emitProgress(`第 ${iteration} 轮：已生成最终结论`);
                steps.push(createStep(iteration, 'FINAL', 'llm_final', query, Array.from(references), finalConclusion.slice(0, 500)));
                break;
            }

            messages.push({ role: 'assistant', content: text });
            messages.push({
                role: 'user',
                content:
                    '请继续研究并输出 FINAL。先做自检：P0占比>=60%、P2占比<=20%、章节完整、避免重复。' +
                    '若证据仍不足，返回 {"status":"need_more_evidence","missingEvidence":[...],"nextActions":[...]}，不要硬输出 FINAL。' +
                    '否则必须返回 JSON，schema 为：' +
                    '{"status":"ready"|"need_more_evidence","plan": string, "updates": string[], "finalConclusion": string, "references": string[],' +
                    '"projectBackground": string（项目的目标、面向的用户群体、核心价值——基于 README/package.json 提炼，偏业务视角）,' +
                    '"technicalOverview": string（宏观架构选型、核心技术栈、能力边界——偏技术/架构视角，与 projectBackground 形成侧重差异）,' +
                    '"architectureFindings": [{"title": string, "judgement": string, "evidence": string[]}],' +
                    '"criticalFlows": [{"name": string, "steps": string[], "evidence": string[]}],' +
                    '"risks": [{"risk": string, "impact": string, "evidence": string[]}],' +
                    '"unknowns": string[], "diagrams"?: string[], "moduleSummaries"?: string[], "missingEvidence"?: string[], "nextActions"?: string[]}。' +
                    '要求：每条结论必须附 evidence；核心判断必须来自 P0/P1 证据，P2 仅作补充；' +
                    'diagrams 至少提供 2 条 Mermaid 源码（High-Level Component Architecture 与 Core Data/Control Flow），必须是抽象的业务/组件架构图，禁止返回 User→UI→API→Service→Data 万能分层图或自然语言。'
            });
        }

        this.throwIfAborted();
        if (!finalConclusion) {
            const minReadCalls = 3;
            let readCount = this.getReadCodeCountFromSteps(steps);
            while (readCount < minReadCalls && remediationRounds < 2) {
                remediationRounds += 1;
                this.emitProgress(`证据深度不足（已读 ${readCount} 个文件），进行第 ${remediationRounds} 轮补救：请用 read_skeleton/read_full_code 补充 P0 文件`);
                messages.push({
                    role: 'user',
                    content:
                        '当前已读代码文件过少，请在本轮仅使用 read_skeleton 或 read_full_code 补充至少 2 个 P0 文件（如 backend/app/main.py、api、core、services 下的关键文件），不要只调用 list_dir。'
                });
                const remediateContext = this.buildContextMessages(
                    messages,
                    updates,
                    Array.from(references),
                    this.maxSteps + remediationRounds,
                    this.maxSteps,
                    tokenUsage.totalTokens,
                    this.maxTotalTokens,
                    tools,
                    [],
                    alreadyReadFiles.size
                );
                apiRequestCount += 1;
                await this.tryLog(logger, 'api_request', {
                    iteration: this.maxSteps + remediationRounds,
                    phase: 'remediation',
                    model: this.llmConfig!.model,
                    messages: this.safeForLog(remediateContext),
                    tools: this.safeForLog(tools)
                });
                const remediateResponse = await chatWithTools(llm, {
                    model: this.llmConfig!.model,
                    messages: remediateContext,
                    tools
                }, this.llmConfig);
                await this.tryLog(logger, 'api_response', {
                    iteration: this.maxSteps + remediationRounds,
                    phase: 'remediation',
                    usage: this.safeForLog(remediateResponse.usage),
                    response: this.safeForLog(remediateResponse)
                });
                tokenUsage.promptTokens += remediateResponse.usage?.prompt_tokens ?? 0;
                tokenUsage.completionTokens += remediateResponse.usage?.completion_tokens ?? 0;
                tokenUsage.totalTokens += remediateResponse.usage?.total_tokens ?? 0;
                tokenUsage.cachedTokens += (remediateResponse.usage as any)?.cached_tokens ?? 0;
                const remediateMsg = remediateResponse.choices?.[0]?.message as any;
                if (!remediateMsg) {
                    break;
                }
                const remediateToolCalls = remediateMsg.tool_calls as any[] | undefined;
                if (remediateToolCalls && remediateToolCalls.length > 0) {
                    appendAssistantToolCallMessage(messages, remediateMsg);
                    for (const call of remediateToolCalls) {
                        const fnName = call.function?.name as string;
                        let args: any = {};
                        try {
                            args = JSON.parse(call.function?.arguments ?? '{}');
                        } catch {
                            args = {};
                        }
                        const result = await this.executeTool(
                            fnName,
                            args,
                            workspacePath,
                            discoveredFiles,
                            discoveredDirs,
                            alreadyReadFiles
                        );
                        toolCallCount += 1;
                        const { contextOutput, evidence } = result;
                        evidence.forEach(e => references.add(e));
                        updates.push(`[${fnName}] ${contextOutput.slice(0, 240)}`);
                        steps.push(
                            createStep(
                                this.maxSteps + remediationRounds,
                                'UPDATE',
                                fnName,
                                JSON.stringify(args),
                                evidence,
                                contextOutput.slice(0, 500)
                            )
                        );
                        messages.push({
                            role: 'tool',
                            tool_call_id: call.id,
                            content: contextOutput
                        });
                    }
                    readCount = this.getReadCodeCountFromSteps(steps);
                } else {
                    const text = (remediateMsg.content ?? '').toString().trim();
                    if (text) {
                        const structured = this.tryParseStructuredFinal(text);
                        if (structured?.status === 'ready') {
                            plan = structured.plan || plan;
                            updates.splice(0, updates.length, ...(structured.updates || updates));
                            finalConclusion = structured.finalConclusion || text;
                            if (structured.projectBackground) { projectBackground = structured.projectBackground; }
                            if (structured.technicalOverview) { technicalOverview = structured.technicalOverview; }
                            (structured.references || []).forEach(ref => references.add(ref));
                            this.normalizeMermaidDiagrams(structured.diagrams || []).forEach(item => diagrams.push(item));
                            (structured.moduleSummaries || []).forEach(item => moduleSummaries.push(item));
                            (structured.architectureFindings || []).forEach(item => architectureFindings.push(item));
                            (structured.criticalFlows || []).forEach(item => criticalFlows.push(item));
                            (structured.risks || []).forEach(item => risks.push(item));
                            (structured.unknowns || []).forEach(item => unknowns.push(item));
                            steps.push(
                                createStep(
                                    this.maxSteps + remediationRounds,
                                    'FINAL',
                                    'remediation_final',
                                    query,
                                    Array.from(references),
                                    (finalConclusion || '').slice(0, 500)
                                )
                            );
                        }
                    }
                    break;
                }
            }

            if (!finalConclusion) {
                this.emitProgress('达到最大轮次，正在强制收敛生成 FINAL');
                const readCodePaths = this.getReadCodePathsFromSteps(steps);
                const forcedMessages = this.buildForcedFinalMessages(query, updates, Array.from(references), readCodePaths);
                apiRequestCount += 1;
                await this.tryLog(logger, 'api_request', {
                    iteration: this.maxSteps + 1,
                    phase: 'forced_final',
                    model: this.llmConfig!.model,
                    messages: this.safeForLog(forcedMessages),
                    tools: []
                });
            const forcedResponse = await chatWithTools(llm, {
                model: this.llmConfig!.model,
                messages: forcedMessages,
                tools: []
            }, this.llmConfig);
            await this.tryLog(logger, 'api_response', {
                iteration: this.maxSteps + 1,
                phase: 'forced_final',
                usage: this.safeForLog(forcedResponse.usage),
                response: this.safeForLog(forcedResponse)
            });
            tokenUsage.promptTokens += forcedResponse.usage?.prompt_tokens ?? 0;
            tokenUsage.completionTokens += forcedResponse.usage?.completion_tokens ?? 0;
            tokenUsage.totalTokens += forcedResponse.usage?.total_tokens ?? 0;
            tokenUsage.cachedTokens += (forcedResponse.usage as any)?.cached_tokens ?? 0;
            const forcedMsg = forcedResponse.choices?.[0]?.message;
            const forcedReasoning = forcedMsg ? extractReasoningFromMessage(forcedMsg) : undefined;
            if (forcedReasoning) {
                await this.tryLogReasoning(logger, this.maxSteps + 1, forcedReasoning);
            }
            const forcedDecisionContent = (forcedMsg?.content ?? '').toString().trim();
            const forcedDecisionToolNames = (forcedMsg?.tool_calls || []).map((c: any) => c.function?.name).filter(Boolean);
            await this.tryLogDecision(logger, this.maxSteps + 1, forcedDecisionContent, forcedDecisionToolNames);
            const forcedText = forcedDecisionContent;
            if (forcedText) {
                const structured = this.tryParseStructuredFinal(forcedText);
                if (structured) {
                    if (structured.status === 'need_more_evidence') {
                        unknowns.push(...(structured.missingEvidence || []));
                        updates.push(`[need_more_evidence] ${(structured.nextActions || []).join(' | ') || '证据不足'}`);
                    }
                    plan = structured.plan || plan;
                    updates.splice(0, updates.length, ...(structured.updates || updates));
                    finalConclusion = structured.finalConclusion || forcedText;
                    if (structured.projectBackground) { projectBackground = structured.projectBackground; }
                    if (structured.technicalOverview) { technicalOverview = structured.technicalOverview; }
                    (structured.references || []).forEach(ref => references.add(ref));
                    this.normalizeMermaidDiagrams(structured.diagrams || []).forEach(item => diagrams.push(item));
                    (structured.moduleSummaries || []).forEach(item => moduleSummaries.push(item));
                    (structured.architectureFindings || []).forEach(item => architectureFindings.push(item));
                    (structured.criticalFlows || []).forEach(item => criticalFlows.push(item));
                    (structured.risks || []).forEach(item => risks.push(item));
                    (structured.unknowns || []).forEach(item => unknowns.push(item));
                } else {
                    finalConclusion = forcedText;
                }
                steps.push(createStep(
                    this.maxSteps + 1,
                    'FINAL',
                    'forced_finalize',
                    query,
                    Array.from(references),
                    finalConclusion.slice(0, 500)
                ));
            }
            }
        }

        if (!plan) {
            plan = `围绕问题“${query}”进行工具驱动研究，优先读取真实代码证据。`;
        }
        if (!finalConclusion) {
            finalConclusion =
                '已完成研究步骤，但模型未返回明确最终结论。建议增加 maxSteps 或检查 provider/model 配置。';
        }
        if (moduleSummaries.length === 0) {
            const componentDirs = Array.from(references).filter(r =>
                /\/src\/components\/[A-Z][^/]*$/.test(r) || /\/src\/[a-z]+$/.test(r)
            );
            for (const dir of componentDirs.slice(0, 15)) {
                moduleSummaries.push(`${path.basename(dir)}（基于目录结构发现）`);
            }
        }
        if (architectureFindings.length === 0 && Array.from(references).length > 5) {
            architectureFindings.push({
                title: '前端技术栈',
                judgement: technicalOverview || '基于 package.json 和目录结构推断技术栈',
                evidence: Array.from(references).filter(r => /package\.json$/.test(r)).slice(0, 2)
            });
            const srcDirs = Array.from(references).filter(r => /\/src\/[a-z]+$/.test(r));
            if (srcDirs.length > 0) {
                architectureFindings.push({
                    title: '前端目录组织',
                    judgement: `源码目录包含 ${srcDirs.map(d => path.basename(d)).join('、')} 等子目录`,
                    evidence: srcDirs.slice(0, 5)
                });
            }
            const backendRefs = Array.from(references).filter(r => /\/backend\//.test(r) || /\/backend$/.test(r));
            if (backendRefs.length > 0) {
                architectureFindings.push({
                    title: '后端服务',
                    judgement: `存在独立的 backend 目录（${backendRefs.length} 条相关引用）`,
                    evidence: backendRefs.slice(0, 3)
                });
            }
        }
        const normalizedReferences = await this.normalizeReferences(Array.from(references), workspacePath);
        const referenceStats = this.buildReferenceStats(normalizedReferences);
        const forcedFinalTriggered = steps.some(step => step.action === 'forced_finalize');
        const promptAblationMetrics = this.computePromptAblationMetrics({
            references: normalizedReferences,
            architectureFindings,
            criticalFlows,
            moduleSummaries,
            risks,
            unknowns,
            forcedFinal: forcedFinalTriggered
        });
        const finalDiagrams = this.ensureMinimumDiagrams(diagrams);
        const finalQuality = this.checkFinalQuality({
            architectureFindings,
            criticalFlows,
            references: normalizedReferences,
            diagrams: finalDiagrams,
            risks,
            unknowns,
            moduleSummaries
        });
        this.emitProgress(`研究完成：${normalizedReferences.length} 条可用引用，正在写入结果`);

        if (!projectBackground || !technicalOverview) {
            const fallbacks = this.extractFallbackFromMessages(messages);
            if (!projectBackground && fallbacks.readmeContent) {
                projectBackground = fallbacks.readmeContent.slice(0, 600);
            }
            if (!technicalOverview && fallbacks.packageJsonContent) {
                try {
                    const pkg = JSON.parse(fallbacks.packageJsonContent);
                    const parts: string[] = [];
                    if (pkg.description) { parts.push(pkg.description); }
                    const deps = Object.keys(pkg.dependencies || {}).slice(0, 15);
                    if (deps.length > 0) { parts.push(`核心依赖：${deps.join(', ')}`); }
                    if (parts.length > 0) { technicalOverview = parts.join('。'); }
                } catch { /* ignore parse error */ }
            }
        }

        const first3RoundToolCounts = steps
            .filter(s => s.stage === 'UPDATE' && s.iteration <= 3)
            .reduce((acc: Record<string, number>, s) => {
                acc[s.action] = (acc[s.action] || 0) + 1;
                return acc;
            }, {});
        await this.tryLog(logger, 'run_end', {
            endedAt: new Date().toISOString(),
            steps: steps.length,
            references: normalizedReferences.length,
            requests: apiRequestCount,
            toolCalls: toolCallCount,
            tokenUsage,
            promptVersion: CORAWIKI_PROMPT_VERSION,
            referenceStats,
            promptAblationMetrics,
            forcedFinalRate: Number(forcedFinalTriggered),
            qualityGatePassed: finalQuality.ok,
            qualityGateReason: finalQuality.reason,
            elapsedMs: Date.now() - new Date(startedAt).getTime(),
            prerunIncluded,
            first3RoundToolCounts,
            remediationRounds
        });

        return {
            query,
            startedAt,
            endedAt: new Date().toISOString(),
            steps,
            plan,
            updates,
            finalConclusion,
            references: normalizedReferences,
            projectBackground: projectBackground || undefined,
            technicalOverview: technicalOverview || undefined,
            debugLogPath,
            tokenUsage,
            promptVersion: CORAWIKI_PROMPT_VERSION,
            referenceStats,
            qualityScore: finalQuality.ok ? 1 : 0,
            diagrams: finalDiagrams,
            moduleSummaries: Array.from(new Set(moduleSummaries)),
            architectureFindings: this.uniqueByJson(architectureFindings),
            criticalFlows: this.uniqueByJson(criticalFlows),
            risks: this.uniqueByJson(risks),
            unknowns: Array.from(new Set(unknowns))
        };
    }

    private async executeTool(
        toolName: string,
        args: Record<string, unknown>,
        workspacePath: string,
        discoveredFiles: Set<string>,
        discoveredDirs: Set<string>,
        alreadyReadFiles: Set<string> = new Set()
    ): Promise<{ rawOutput: string; contextOutput: string; evidence: string[] }> {
        try {
            if (toolName === 'list_dir') {
                const targetPath = this.resolvePath(String(args.targetPath ?? workspacePath), workspacePath);
                const entries = await listDir(targetPath, { maxEntries: 200 });
                discoveredDirs.add(targetPath);
                for (const entry of entries) {
                    const resolvedPath = this.resolvePath(entry.path, workspacePath);
                    if (entry.type === 'file') {
                        discoveredFiles.add(resolvedPath);
                    } else if (entry.type === 'directory') {
                        discoveredDirs.add(resolvedPath);
                    }
                }
                const evidence = entries.map(e => e.path);
                const rawOutput = JSON.stringify(entries, null, 2);
                const files = entries.filter(item => item.type === 'file').slice(0, 30).map(item => item.path);
                const dirs = entries.filter(item => item.type === 'directory').slice(0, 20).map(item => item.path);
                return {
                    rawOutput,
                    contextOutput:
                        `list_dir(${targetPath}) files=${entries.filter(item => item.type === 'file').length}, ` +
                        `dirs=${entries.filter(item => item.type === 'directory').length}\n` +
                        `fileSamples:\n- ${files.join('\n- ') || '(none)'}\n` +
                        `dirSamples:\n- ${dirs.join('\n- ') || '(none)'}`,
                    evidence
                };
            }

            if (toolName === 'read_skeleton') {
                const filePath = this.resolvePath(String(args.filePath ?? ''), workspacePath);
                if (!discoveredFiles.has(filePath)) {
                    const parentDir = path.dirname(filePath);
                    const hint = discoveredDirs.has(parentDir)
                        ? `该目录已发现，请先从目录结果中选择真实文件：${parentDir}`
                        : `请先调用 list_dir 探索目录：${parentDir}`;
                    const msg =
                        `path_guard_blocked(read_skeleton): ${filePath}\n` +
                        `原因：目标文件不在已发现文件集合中（禁止猜测路径）。\n${hint}`;
                    return { rawOutput: msg, contextOutput: msg, evidence: [] };
                }
                if (alreadyReadFiles.has(filePath)) {
                    const msg = `duplicate_read_blocked(read_skeleton): ${filePath}\n此文件已在之前的轮次中读取过，请勿重复读取。将宝贵的工具调用机会用于尚未读取的文件。`;
                    return { rawOutput: msg, contextOutput: msg, evidence: [] };
                }
                const skeleton = await readSkeleton(filePath);
                alreadyReadFiles.add(filePath);
                this.autoDiscoverImportedFiles(skeleton.imports, filePath, workspacePath, discoveredFiles, discoveredDirs);
                const rawOutput = JSON.stringify(skeleton, null, 2);
                const imports = skeleton.imports.slice(0, 30);
                const symbols = skeleton.symbols.slice(0, 50);
                return {
                    rawOutput,
                    contextOutput:
                        `read_skeleton(${filePath}) hash=${skeleton.hash}\n` +
                        `imports(${skeleton.imports.length}): ${imports.join(' | ')}\n` +
                        `symbols(${skeleton.symbols.length}): ${symbols.join(' | ')}`,
                    evidence: [skeleton.filePath]
                };
            }

            if (toolName === 'read_full_code') {
                const filePath = this.resolvePath(String(args.filePath ?? ''), workspacePath);
                if (!discoveredFiles.has(filePath)) {
                    const parentDir = path.dirname(filePath);
                    const hint = discoveredDirs.has(parentDir)
                        ? `该目录已发现，请先从目录结果中选择真实文件：${parentDir}`
                        : `请先调用 list_dir 探索目录：${parentDir}`;
                    const msg =
                        `path_guard_blocked(read_full_code): ${filePath}\n` +
                        `原因：目标文件不在已发现文件集合中（禁止猜测路径）。\n${hint}`;
                    return { rawOutput: msg, contextOutput: msg, evidence: [] };
                }
                if (alreadyReadFiles.has(filePath)) {
                    const msg = `duplicate_read_blocked(read_full_code): ${filePath}\n此文件已在之前的轮次中读取过，请勿重复读取。将宝贵的工具调用机会用于尚未读取的文件。`;
                    return { rawOutput: msg, contextOutput: msg, evidence: [] };
                }
                const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
                const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;
                const content = await readFullCode(filePath, { startLine, endLine });
                alreadyReadFiles.add(filePath);
                const contextOutput = this.compressCodeForContext(content);
                return {
                    rawOutput: content,
                    contextOutput,
                    evidence: [filePath]
                };
            }

            if (toolName === 'discover_entrypoints') {
                const root = this.resolvePath(String(args.root ?? workspacePath), workspacePath);
                const entries = await discoverEntrypoints(root);
                for (const e of entries) {
                    discoveredFiles.add(e.filePath);
                    discoveredDirs.add(path.dirname(e.filePath));
                }
                const rawOutput = JSON.stringify(entries, null, 2);
                const summary = entries.length > 0
                    ? entries.slice(0, 15).map(e => `${e.filePath} (${e.type}: ${e.description})`).join('\n')
                    : '(none)';
                return {
                    rawOutput,
                    contextOutput: `discover_entrypoints(${root}) found ${entries.length} entrypoints:\n${summary}`,
                    evidence: entries.map(e => e.filePath)
                };
            }

            if (toolName === 'analyze_dependencies') {
                const filePaths = Array.isArray(args.filePaths)
                    ? (args.filePaths as string[]).map(p => this.resolvePath(String(p), workspacePath))
                    : [];
                const wsPath = this.resolvePath(String(args.workspacePath ?? workspacePath), workspacePath);
                const results = await analyzeDependencies(filePaths, wsPath);
                for (const r of results) {
                    discoveredFiles.add(r.filePath);
                }
                const rawOutput = JSON.stringify(results, null, 2);
                const summary = results
                    .map(r => `${r.filePath}: imports=${r.imports.length}, local=${r.localDeps.length}, external=${r.externalDeps.length}`)
                    .join('\n');
                return {
                    rawOutput,
                    contextOutput: `analyze_dependencies:\n${summary}`,
                    evidence: results.map(r => r.filePath)
                };
            }

            if (toolName === 'summarize_directory') {
                const targetPath = this.resolvePath(String(args.targetPath ?? workspacePath), workspacePath);
                const summary = await summarizeDirectory(targetPath);
                discoveredDirs.add(targetPath);
                const rawOutput = JSON.stringify(summary, null, 2);
                const contextOutput =
                    `summarize_directory(${targetPath}) files=${summary.fileCount}, dirs=${summary.dirCount}, ` +
                    `code=${summary.codeFiles}, md=${summary.markdownFiles}, config=${summary.configFiles}`;
                return {
                    rawOutput,
                    contextOutput,
                    evidence: [targetPath]
                };
            }

            if (toolName === 'extract_import_graph' || toolName === 'analyze_complexity') {
                if (!this.enablePythonTooling || !this.extensionPath) {
                    const msg =
                        `python_tool_unavailable(${toolName}): 请在设置中开启 knowledgeBase.coraWiki.pythonTooling.enabled 并确保扩展已正确安装。`;
                    return { rawOutput: msg, contextOutput: msg, evidence: [] };
                }
                if (this.pythonSkippedForThisRun) {
                    const msg = `python_tool_skipped(${toolName}): 用户已选择跳过 Python 分析，本 run 内不再执行。`;
                    return { rawOutput: msg, contextOutput: msg, evidence: [] };
                }
                const filePaths = Array.isArray(args.filePaths)
                    ? (args.filePaths as string[]).map(p => this.resolvePath(String(p), workspacePath))
                    : [];
                const wsPath = this.resolvePath(String(args.workspacePath ?? workspacePath), workspacePath);
                let pyResult = await runPythonTool(
                    this.extensionPath,
                    this.pythonPath,
                    toolName === 'extract_import_graph' ? 'extract_import_graph' : 'analyze_complexity',
                    { filePaths, workspacePath: wsPath },
                    wsPath
                );
                if (!pyResult.ok && this.onPythonError) {
                    const choice = await this.onPythonError(pyResult.error, 'tool');
                    if (choice === 'skip') {
                        this.pythonSkippedForThisRun = true;
                        const msg = `python_tool_skipped(${toolName}): 用户选择跳过 Python 分析。`;
                        return { rawOutput: msg, contextOutput: msg, evidence: [] };
                    }
                    if (choice === 'retry') {
                        pyResult = await runPythonTool(
                            this.extensionPath,
                            this.pythonPath,
                            toolName === 'extract_import_graph' ? 'extract_import_graph' : 'analyze_complexity',
                            { filePaths, workspacePath: wsPath },
                            wsPath
                        );
                    }
                }
                if (!pyResult.ok) {
                    return {
                        rawOutput: `python_tool_error(${toolName}): ${pyResult.error}`,
                        contextOutput: `python_tool_error(${toolName}): ${pyResult.error}`,
                        evidence: []
                    };
                }
                const rawOutput = JSON.stringify(pyResult.result, null, 2);
                const resultArr = Array.isArray(pyResult.result) ? pyResult.result as Array<{ filePath?: string }> : [];
                for (const r of resultArr) {
                    if (r?.filePath) discoveredFiles.add(r.filePath);
                }
                const contextOutput =
                    toolName === 'extract_import_graph'
                        ? `extract_import_graph: ${resultArr.length} files, samples: ${resultArr.slice(0, 5).map((x: any) => `${x.filePath} imports=${x.imports?.length ?? 0} local=${x.localDeps?.length ?? 0}`).join('; ')}`
                        : `analyze_complexity: ${resultArr.length} files`;
                return {
                    rawOutput,
                    contextOutput,
                    evidence: resultArr.map((r: { filePath?: string }) => r.filePath).filter(Boolean) as string[]
                };
            }

            return { rawOutput: `unknown_tool: ${toolName}`, contextOutput: `unknown_tool: ${toolName}`, evidence: [] };
        } catch (error) {
            return {
                rawOutput: `tool_error(${toolName}): ${String(error)}`,
                contextOutput: `tool_error(${toolName}): ${String(error)}`,
                evidence: []
            };
        }
    }

    private resolvePath(inputPath: string, workspacePath: string): string {
        const normalized = path.isAbsolute(inputPath) ? inputPath : path.join(workspacePath, inputPath);
        return normalized;
    }

    private safeForLog(value: unknown): unknown {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return '[unserializable]';
        }
    }

    private buildContextMessages(
        messages: any[],
        updates: string[],
        references: string[],
        iteration: number,
        maxSteps: number,
        totalTokens: number,
        maxTotalTokens: number,
        tools?: ToolSpec[],
        lastRoundToolNames: string[] = [],
        alreadyReadFilesCount: number = 0
    ): any[] {
        const remainingSteps = Math.max(0, maxSteps - iteration);
        const remainingTokens = Math.max(0, maxTotalTokens - totalTokens);
        let metaContent =
            `评估元数据：当前轮次=${iteration}/${maxSteps}，剩余轮次=${remainingSteps}，` +
            `当前累计tokens=${totalTokens}，token预算上限=${maxTotalTokens}，剩余token预算=${remainingTokens}，` +
            `已深入读取代码文件=${alreadyReadFilesCount}个。` +
            `若证据不足请返回 need_more_evidence；若证据充分请优先收敛并输出 FINAL。`;
        metaContent += `\n**并行调用**：每轮**必须**同时调用 3-5 个工具（在一次回复中返回多个 tool_calls），禁止每轮只调 1-2 个。` +
            `例如：同时调用 read_skeleton(fileA) + read_skeleton(fileB) + list_dir(dirC) + summarize_directory(dirD)。`;
        if (tools && tools.length > 0) {
            const catalog = tools.map(t => `${t.function.name}=${t.function.description}`).join('；');
            metaContent += `\n可用工具及说明：${catalog}`;
        }
        if (lastRoundToolNames.length > 0 && tools && tools.length > 0) {
            const descMap = new Map(tools.map(t => [t.function.name, t.function.description]));
            const lastRound = lastRoundToolNames.map(n => `${n}（${descMap.get(n) ?? ''}）`).join('、');
            metaContent += `\n上一轮已调用工具：${lastRound}`;
        }
        const hasDiscoverOrSummarize = lastRoundToolNames.some(n =>
            n === 'discover_entrypoints' || n === 'summarize_directory'
        );
        if (iteration <= 2 && !hasDiscoverOrSummarize) {
            metaContent += '\n前 2 轮内建议至少各调用一次 discover_entrypoints(root) 与 summarize_directory(目标目录)，建立概览后再 list_dir 或 read_skeleton。';
        }
        const onlyListDir = lastRoundToolNames.length > 0 && lastRoundToolNames.every(n => n === 'list_dir');
        if (onlyListDir && iteration >= 2) {
            metaContent += '\n**禁止**连续两轮只使用 list_dir。本轮**必须**使用 read_skeleton 或 read_full_code 读取至少 1 个 P0 源码文件（src/**、backend/app/**），禁止再调 list_dir。';
        }
        const p0Refs = references.filter(r => /\/(src|backend|frontend|app|lib|packages)\/[^/]+\.(ts|tsx|js|jsx|py|go|rs|java|vue|svelte)$/i.test(r));
        if (iteration >= 4 && p0Refs.length < 3) {
            metaContent += `\n**警告**：已进行 ${iteration} 轮，但只读取了 ${p0Refs.length} 个 P0 源码文件。本轮**必须**优先使用 read_skeleton 或 read_full_code 深入阅读核心代码，禁止继续仅用 list_dir 探索。`;
        }
        if (alreadyReadFilesCount < 10 && iteration >= 3) {
            metaContent += `\n**代码覆盖不足**：目前只深入读取了 ${alreadyReadFilesCount} 个文件，目标至少 15 个。请在本轮并行调用多个 read_skeleton 加速。`;
        }
        const runMeta = { role: 'system' as const, content: metaContent };
        /** 后续轮在 runMeta 后加一条短 user，满足部分 API（如 Minimax）要求请求中至少有一条 user 消息，避免 500。 */
        const continuationUser = { role: 'user' as const, content: '继续基于上述上下文进行分析。' };
        const baseCount = 2;
        const maxTail = 12;
        const isFirstRound = iteration <= 1;

        if (messages.length <= baseCount + maxTail) {
            if (isFirstRound) {
                return this.sanitizeToolMessageSequence([...messages, runMeta]);
            }
            return this.sanitizeToolMessageSequence([runMeta, continuationUser, ...messages.slice(baseCount)]);
        }

        const base = messages.slice(0, baseCount);
        const middle = messages.slice(baseCount, -maxTail);
        const tail = messages.slice(-maxTail);
        const middleToolCalls = middle.filter(item => item?.role === 'tool').length;
        const middleAssistant = middle.filter(item => item?.role === 'assistant').length;
        const summary = {
            role: 'system',
            content:
                `历史压缩摘要：已压缩 ${middle.length} 条消息（assistant=${middleAssistant}, tool=${middleToolCalls}）。` +
                `已收集证据 ${references.length} 条，最近更新：${updates.slice(-3).join(' | ') || '(none)'}` +
                `。请基于已有证据继续，不要重复读取相同文件。`
        };
        if (isFirstRound) {
            return this.sanitizeToolMessageSequence([...base, runMeta, summary, ...tail]);
        }
        return this.sanitizeToolMessageSequence([runMeta, continuationUser, summary, ...tail]);
    }

    private sanitizeToolMessageSequence(messages: any[]): any[] {
        const seenToolCallIds = new Set<string>();
        const sanitized: any[] = [];
        for (const msg of messages) {
            if (!msg || typeof msg !== 'object') {
                continue;
            }
            if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
                for (const call of msg.tool_calls) {
                    if (call?.id) {
                        seenToolCallIds.add(String(call.id));
                    }
                }
                sanitized.push(msg);
                continue;
            }
            if (msg.role === 'tool') {
                const toolCallId = String(msg.tool_call_id ?? '');
                if (!toolCallId || !seenToolCallIds.has(toolCallId)) {
                    continue;
                }
                sanitized.push(msg);
                continue;
            }
            sanitized.push(msg);
        }
        return sanitized;
    }

    private compressCodeForContext(content: string): string {
        const lines = content.split('\n');
        if (lines.length <= 220) {
            return content;
        }
        const head = lines.slice(0, 120).join('\n');
        const tail = lines.slice(-80).join('\n');
        return `${head}\n\n... [omitted ${lines.length - 200} lines for context budget] ...\n\n${tail}`;
    }

    private buildBudgetFinalConclusion(query: string, references: string[], totalTokens: number): string {
        const refPreview = references.slice(0, 8).join(', ') || '(none)';
        return `达到 token 预算阈值后提前收敛。问题：${query}。当前累计 token=${totalTokens}。基于已有证据（${refPreview}）给出阶段性结论，建议缩小问题范围或提高 maxTotalTokens 后重试。`;
    }

    private tryParseStructuredFinal(content: string): {
        status?: 'ready' | 'need_more_evidence';
        plan?: string;
        updates?: string[];
        finalConclusion?: string;
        references?: string[];
        projectBackground?: string;
        technicalOverview?: string;
        diagrams?: string[];
        moduleSummaries?: string[];
        architectureFindings?: Array<{ title: string; judgement: string; evidence: string[] }>;
        criticalFlows?: Array<{ name: string; steps: string[]; evidence: string[] }>;
        risks?: Array<{ risk: string; impact: string; evidence: string[] }>;
        unknowns?: string[];
        missingEvidence?: string[];
        nextActions?: string[];
    } | undefined {
        const trimmed = content.trim();
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(trimmed.slice(start, end + 1));
            if (typeof parsed !== 'object' || !parsed) {
                return undefined;
            }
            return parsed;
        } catch {
            return undefined;
        }
    }

    private getReadCodeCountFromSteps(steps: ResearchStep[]): number {
        return steps.filter(
            s => s.stage === 'UPDATE' && (s.action === 'read_skeleton' || s.action === 'read_full_code')
        ).length;
    }

    private getReadCodePathsFromSteps(steps: ResearchStep[]): string[] {
        const paths: string[] = [];
        for (const s of steps) {
            if (s.stage === 'UPDATE' && (s.action === 'read_skeleton' || s.action === 'read_full_code')) {
                for (const e of s.evidence) {
                    if (e && !paths.includes(e)) {
                        paths.push(e);
                    }
                }
            }
        }
        return paths;
    }

    private checkFinalQuality(input: {
        architectureFindings: Array<{ title: string; judgement: string; evidence: string[] }>;
        criticalFlows: Array<{ name: string; steps: string[]; evidence: string[] }>;
        references: string[];
        diagrams: string[];
        risks?: Array<{ risk: string; impact: string; evidence: string[] }>;
        unknowns?: string[];
        moduleSummaries?: string[];
    }): { ok: boolean; reason?: string } {
        if (input.architectureFindings.length < 3) {
            return { ok: false, reason: 'architectureFindings 少于 3 条' };
        }
        if (input.criticalFlows.length < 1) {
            return { ok: false, reason: 'criticalFlows 缺失' };
        }
        if (!input.moduleSummaries || input.moduleSummaries.length < 1) {
            return { ok: false, reason: 'Module Responsibilities 缺失' };
        }
        if (!input.risks || input.risks.length < 1) {
            return { ok: false, reason: 'risks 缺失' };
        }
        if (!input.unknowns || input.unknowns.length < 1) {
            return { ok: false, reason: 'unknowns 缺失' };
        }
        const findingWithoutEvidence = input.architectureFindings.find(item => !item.evidence || item.evidence.length === 0);
        if (findingWithoutEvidence) {
            return { ok: false, reason: `finding 无证据: ${findingWithoutEvidence.title}` };
        }
        const flowWithoutEvidence = input.criticalFlows.find(item => !item.evidence || item.evidence.length === 0);
        if (flowWithoutEvidence) {
            return { ok: false, reason: `flow 无证据: ${flowWithoutEvidence.name}` };
        }
        if (input.references.length < 5) {
            return { ok: false, reason: 'references 过少（<5）' };
        }
        const refStats = this.buildReferenceStats(input.references);
        if (refStats.sourceEvidenceRatio < 0.6) {
            return {
                ok: false,
                reason: `P0 源码证据占比不足（当前 ${(refStats.sourceEvidenceRatio * 100).toFixed(1)}%）`
            };
        }
        if (refStats.docNoiseRatio > 0.2) {
            return {
                ok: false,
                reason: `P2 文档噪声占比过高（当前 ${(refStats.docNoiseRatio * 100).toFixed(1)}%）`
            };
        }
        const normalizedJudgements = input.architectureFindings
            .map(item => item.judgement.toLowerCase().replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (new Set(normalizedJudgements).size < normalizedJudgements.length) {
            return { ok: false, reason: 'architectureFindings 存在重复语义' };
        }
        if (input.diagrams.length < 2) {
            return { ok: false, reason: 'diagrams 少于 2 条 Mermaid 源码' };
        }
        return { ok: true };
    }

    private normalizeMermaidDiagrams(diagrams: string[]): string[] {
        const validStarts = ['graph ', 'flowchart ', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2'];
        const extracted: string[] = [];
        for (const raw of diagrams) {
            const text = String(raw ?? '').trim();
            if (!text) {
                continue;
            }
            const blocks = this.extractMermaidBlocks(text);
            if (blocks.length > 0) {
                extracted.push(...blocks);
            } else {
                extracted.push(text);
            }
        }
        return Array.from(new Set(extracted))
            .map(item => item.trim())
            .filter(item => validStarts.some(prefix => item.startsWith(prefix)));
    }

    private extractMermaidBlocks(text: string): string[] {
        const blocks: string[] = [];
        const re = /```mermaid\s*([\s\S]*?)```/gi;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            const code = (match[1] ?? '').trim();
            if (code) {
                blocks.push(code);
            }
        }
        return blocks;
    }

    private ensureMinimumDiagrams(diagrams: string[]): string[] {
        const normalized = this.normalizeMermaidDiagrams(diagrams);
        return normalized.slice(0, 6);
    }

    private buildForcedFinalMessages(
        query: string,
        updates: string[],
        references: string[],
        readCodePaths: string[] = []
    ): any[] {
        const evidence = references.slice(0, 120).join('\n- ') || '(none)';
        const recentUpdates = updates.slice(-30).join('\n- ') || '(none)';
        let userContent =
            `研究问题：${query}\n` +
            `已收集证据（节选）：\n- ${evidence}\n` +
            `最近更新（节选）：\n- ${recentUpdates}\n`;
        const n = readCodePaths.length;
        userContent += `已读代码文件（read_skeleton/read_full_code）共 ${n} 个：${readCodePaths.slice(0, 20).join(', ')}${readCodePaths.length > 20 ? '...' : ''}\n`;
        if (n < 3) {
            userContent +=
                '已读代码较少，但你仍**必须**基于已有的 README、package.json 和目录结构信息，尽力填充所有字段。\n';
        }
        userContent +=
            '请直接输出 FINAL JSON，不要输出其他文本。schema：' +
            '{"status":"ready"|"need_more_evidence","plan": string, "updates": string[], "finalConclusion": string, "references": string[],' +
            '"projectBackground": string（**必填**至少 80 字：项目要解决的核心问题、目标用户画像、差异化价值主张，不要照搬 README 原文，要提炼洞察）,' +
            '"technicalOverview": string（**必填**至少 100 字：站在架构师视角阐述——技术选型理由、整体分层策略、核心设计模式如 MVC/Event-Driven/Plugin、前后端协作方式、关键依赖的选型权衡）,' +
            '"architectureFindings": [{"title": string, "judgement": string, "evidence": string[]}]（**必须至少 5 条**，每条是一个架构优劣势判断而非简单罗列）,' +
            '"criticalFlows": [{"name": string, "steps": string[], "evidence": string[]}]（**必须至少 2 条**，每条至少 5 步，选择最体现系统复杂度的流程）,' +
            '"risks": [{"risk": string, "impact": string, "evidence": string[]}]（至少 2 条技术风险）,' +
            '"unknowns": string[], ' +
            '"diagrams"?: string[]（**必须至少 2 条 Mermaid 源码**：(1)基于真实模块名的组件架构图 (2)核心业务流程 sequence/flowchart，禁止万能分层图）, ' +
            '"moduleSummaries"?: string[]（**必须列出每个已发现模块的职责描述和核心接口，不要只写目录名**）, ' +
            '"missingEvidence"?: string[], "nextActions"?: string[]}。' +
            '所有数组字段**禁止为空**。不确定的内容用合理推断 + unknowns 标注。';
        return [
            {
                role: 'system',
                content:
                    '你是 CoraWiki 的 FINAL 汇总器。你不能调用工具，只能基于已有证据输出最终 JSON。' +
                    '**核心要求**：无论 status 是 ready 还是 need_more_evidence，你都**必须**尽力填充所有字段。' +
                    'projectBackground 必须根据 README 或项目描述填写项目目标与价值；technicalOverview 必须根据 package.json 或已读代码填写技术栈与架构选型。' +
                    'architectureFindings 至少提供 5 条基于已有证据的**架构判断**（不是简单罗列"使用了XX"，而是架构优劣势分析，如"采用 XX 模式使得 YY 解耦，但缺少 ZZ 导致 WW 风险"）；' +
                    'criticalFlows 至少提供 2 条，每条至少 5 步，选择最能体现系统复杂度的业务流程；' +
                    'moduleSummaries 必须列出每个模块的职责描述和核心对外接口，不要只写目录名。' +
                    'diagrams 必须提供至少 2 条 Mermaid 源码：(1) 基于实际阅读代码的组件架构图，标注真实模块名和依赖方向 (2) 至少一个核心业务流程的 sequence 或 flowchart 图。' +
                    '**禁止**返回空数组，**禁止**返回 User→UI→API→Service→Data 的万能分层图。' +
                    '如果证据有限，基于已有信息进行合理推断并在 unknowns 中标注待确认项。'
            },
            {
                role: 'user',
                content: userContent
            }
        ];
    }

    private uniqueByJson<T>(items: T[]): T[] {
        const seen = new Set<string>();
        const output: T[] = [];
        for (const item of items) {
            const key = JSON.stringify(item);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            output.push(item);
        }
        return output;
    }

    private classifyReferencePath(ref: string): 'P0' | 'P1' | 'P2' {
        const normalized = ref.replace(/\\/g, '/').toLowerCase();
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

    private buildReferenceStats(references: string[]): ReferenceStats {
        const total = references.length || 1;
        let p0 = 0;
        let p1 = 0;
        let p2 = 0;
        for (const ref of references) {
            const tier = this.classifyReferencePath(this.parseReference(ref).filePath);
            if (tier === 'P0') {
                p0 += 1;
            } else if (tier === 'P1') {
                p1 += 1;
            } else {
                p2 += 1;
            }
        }
        return {
            p0,
            p1,
            p2,
            sourceEvidenceRatio: p0 / total,
            docNoiseRatio: p2 / total
        };
    }

    private computePromptAblationMetrics(input: {
        references: string[];
        architectureFindings: Array<{ title: string; judgement: string; evidence: string[] }>;
        criticalFlows: Array<{ name: string; steps: string[]; evidence: string[] }>;
        moduleSummaries: string[];
        risks: Array<{ risk: string; impact: string; evidence: string[] }>;
        unknowns: string[];
        forcedFinal: boolean;
    }): {
        sourceEvidenceRatio: number;
        docNoiseRatio: number;
        sectionCompleteness: number;
        duplicateFindingRate: number;
        forcedFinalRate: number;
    } {
        const stats = this.buildReferenceStats(input.references);
        const sections = [
            input.architectureFindings.length > 0,
            input.criticalFlows.length > 0,
            input.moduleSummaries.length > 0,
            input.risks.length > 0,
            input.unknowns.length > 0
        ];
        const normalizedJudgements = input.architectureFindings
            .map(item => item.judgement.toLowerCase().replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        const duplicateCount = normalizedJudgements.length - new Set(normalizedJudgements).size;
        return {
            sourceEvidenceRatio: stats.sourceEvidenceRatio,
            docNoiseRatio: stats.docNoiseRatio,
            sectionCompleteness: sections.filter(Boolean).length / sections.length,
            duplicateFindingRate: normalizedJudgements.length > 0 ? duplicateCount / normalizedJudgements.length : 0,
            forcedFinalRate: Number(input.forcedFinal)
        };
    }

    private prioritizeReferences(references: string[]): string[] {
        const p0: string[] = [];
        const p1: string[] = [];
        const p2: string[] = [];
        for (const ref of references) {
            const filePath = this.parseReference(ref).filePath;
            const normalized = filePath.replace(/\\/g, '/').toLowerCase();
            const isNoise =
                /^ep-[^/]+\.md$/.test(path.basename(normalized)) ||
                normalized.includes('report') ||
                normalized.includes('summary');
            const tier = this.classifyReferencePath(filePath);
            if (tier === 'P0') {
                p0.push(ref);
            } else if (tier === 'P1') {
                p1.push(ref);
            } else if (!isNoise) {
                p2.push(ref);
            }
        }
        const p0Limited = p0.slice(0, 36);
        const p1Limited = p1.slice(0, 18);
        const p2Limit = Math.max(4, Math.floor((p0Limited.length + p1Limited.length) * 0.2));
        const p2Limited = p2.slice(0, p2Limit);
        return [...p0Limited, ...p1Limited, ...p2Limited];
    }

    private async normalizeReferences(references: string[], workspacePath: string): Promise<string[]> {
        const normalized = new Set<string>();
        for (const raw of references) {
            const parsed = this.parseReference(raw);
            if (!parsed.filePath || parsed.filePath.includes('__pycache__') || parsed.filePath.includes('/.git/')) {
                continue;
            }
            const absolutePath = path.isAbsolute(parsed.filePath)
                ? parsed.filePath
                : path.join(workspacePath, parsed.filePath);
            try {
                const stat = await fs.stat(absolutePath);
                if (!stat.isFile()) {
                    continue;
                }
            } catch {
                continue;
            }
            const finalPath = absolutePath.startsWith(workspacePath)
                ? path.relative(workspacePath, absolutePath).replace(/\\/g, '/')
                : absolutePath;
            if (parsed.lineStart && parsed.lineStart > 0) {
                if (parsed.lineEnd && parsed.lineEnd > parsed.lineStart) {
                    normalized.add(`${finalPath}:${parsed.lineStart}-${parsed.lineEnd}`);
                } else {
                    normalized.add(`${finalPath}:${parsed.lineStart}`);
                }
            } else {
                normalized.add(finalPath);
            }
        }
        return this.prioritizeReferences(Array.from(normalized));
    }

    private parseReference(raw: string): { filePath: string; lineStart?: number; lineEnd?: number } {
        const text = raw.trim();
        const lineMatch = /^(.*?):(\d+)(?:-(\d+))?$/.exec(text);
        if (!lineMatch) {
            return { filePath: text };
        }
        return {
            filePath: lineMatch[1],
            lineStart: Number(lineMatch[2]),
            lineEnd: lineMatch[3] ? Number(lineMatch[3]) : undefined
        };
    }

    private emitProgress(message: string): void {
        if (!this.onProgress) {
            return;
        }
        try {
            this.onProgress(message);
        } catch {
            // Ignore progress callback errors.
        }
    }

    private formatToolTarget(toolName: string, args: Record<string, unknown>): string {
        if (toolName === 'list_dir' && typeof args.targetPath === 'string') {
            return `: ${path.basename(args.targetPath) || args.targetPath}`;
        }
        if ((toolName === 'read_skeleton' || toolName === 'read_full_code') && typeof args.filePath === 'string') {
            return `: ${path.basename(args.filePath) || args.filePath}`;
        }
        return '';
    }

    private async tryLog(logger: ResearchLogger, type: string, payload: unknown): Promise<void> {
        try {
            await logger.append(type, payload);
        } catch {
            // Logging failures should not block research flow.
        }
    }

    private async tryLogReasoning(logger: ResearchLogger, iteration: number, reasoningText: string): Promise<void> {
        try {
            await logger.appendReasoning(iteration, reasoningText);
        } catch {
            // Logging failures should not block research flow.
        }
    }

    private async tryLogDecision(
        logger: ResearchLogger,
        iteration: number,
        content: string,
        toolNames: string[]
    ): Promise<void> {
        try {
            await logger.appendDecision(iteration, content, toolNames);
        } catch {
            // Logging failures should not block research flow.
        }
    }

    /** Pre-populate discoveredFiles with common root-level project descriptor files so the LLM can read them without prior list_dir. */
    private async injectRootWhitelistFiles(
        workspacePath: string,
        discoveredFiles: Set<string>
    ): Promise<void> {
        try {
            const entries = await fs.readdir(workspacePath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile()) {
                    continue;
                }
                if (ROOT_WHITELIST_PATTERNS.some(re => re.test(entry.name))) {
                    discoveredFiles.add(path.join(workspacePath, entry.name));
                }
            }
        } catch {
            // If root dir is unreadable, skip silently — tools will still discover files normally.
        }
    }

    private extractFallbackFromMessages(messages: any[]): { readmeContent?: string; packageJsonContent?: string } {
        let readmeContent: string | undefined;
        let packageJsonContent: string | undefined;
        for (const msg of messages) {
            if (msg.role !== 'tool') { continue; }
            const content = String(msg.content ?? '');
            if (!readmeContent && /readme[._-]?/i.test(content.slice(0, 80))) {
                const lines = content.split('\n');
                const bodyLines = lines.filter(l => !l.startsWith('read_full_code(') && !l.startsWith('read_skeleton('));
                if (bodyLines.length > 2) {
                    readmeContent = bodyLines.join('\n').trim();
                }
            }
            if (!packageJsonContent && content.includes('"dependencies"') && content.includes('"name"')) {
                const jsonMatch = content.match(/\{[\s\S]*"name"[\s\S]*\}/);
                if (jsonMatch) {
                    packageJsonContent = jsonMatch[0];
                }
            }
            if (readmeContent && packageJsonContent) { break; }
        }
        return { readmeContent, packageJsonContent };
    }

    private async scanHotspotModules(workspacePath: string): Promise<{
        summary: string | undefined;
        indexFiles: string[];
    }> {
        const scanDirs = ['src', 'frontend/src', 'backend/app', 'backend', 'app', 'lib', 'packages'];
        const moduleStats: Array<{ dir: string; absDir: string; fileCount: number; dirCount: number }> = [];
        const skipNames = new Set(['node_modules', '.git', 'dist', 'build', 'out', '__pycache__', '.next', '.nuxt', 'coverage']);

        for (const rel of scanDirs) {
            const full = path.join(workspacePath, rel);
            try {
                const st = await fs.stat(full);
                if (!st.isDirectory()) continue;
            } catch { continue; }

            try {
                const entries = await fs.readdir(full, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory() || skipNames.has(entry.name) || entry.name.startsWith('.')) continue;
                    const subDir = path.join(full, entry.name);
                    try {
                        const { fileCount, dirCount } = await this.countFilesRecursive(subDir, 3);
                        if (fileCount > 5) {
                            moduleStats.push({ dir: `${rel}/${entry.name}`, absDir: subDir, fileCount, dirCount });
                        }
                    } catch { /* skip unreadable dirs */ }
                }
            } catch { /* skip */ }
        }

        if (moduleStats.length === 0) return { summary: undefined, indexFiles: [] };
        moduleStats.sort((a, b) => b.fileCount - a.fileCount);

        const indexCandidates = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.vue', 'index.py', 'main.ts', 'main.tsx', 'main.js', 'main.py'];
        const indexFiles: string[] = [];
        for (const mod of moduleStats.slice(0, 8)) {
            for (const candidate of indexCandidates) {
                const candidatePath = path.join(mod.absDir, candidate);
                try {
                    await fs.access(candidatePath);
                    indexFiles.push(candidatePath);
                    break;
                } catch { /* not found, try next */ }
            }
        }

        const top = moduleStats.slice(0, 20);
        const lines = top.map(m => `  ${m.dir}: ${m.fileCount} files, ${m.dirCount} subdirs`);
        const summary = `【热点模块扫描】按文件数排序的子模块（共发现 ${moduleStats.length} 个）：\n${lines.join('\n')}\n建议优先对文件数最多的模块使用 read_skeleton 或 summarize_directory 深入分析。`;
        return { summary, indexFiles };
    }

    private async countFilesRecursive(dir: string, maxDepth: number): Promise<{ fileCount: number; dirCount: number }> {
        let fileCount = 0;
        let dirCount = 0;
        const stack: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];
        const skipNames = new Set(['node_modules', '.git', 'dist', 'build', 'out', '__pycache__', '.next', '.nuxt', 'coverage']);

        while (stack.length > 0) {
            const current = stack.pop()!;
            try {
                const entries = await fs.readdir(current.path, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || skipNames.has(entry.name)) continue;
                    if (entry.isDirectory()) {
                        dirCount++;
                        if (current.depth < maxDepth) {
                            stack.push({ path: path.join(current.path, entry.name), depth: current.depth + 1 });
                        }
                    } else {
                        fileCount++;
                    }
                }
            } catch { /* skip */ }
        }
        return { fileCount, dirCount };
    }

    private autoDiscoverImportedFiles(
        imports: string[],
        sourceFilePath: string,
        workspacePath: string,
        discoveredFiles: Set<string>,
        discoveredDirs: Set<string>
    ): void {
        const sourceDir = path.dirname(sourceFilePath);
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.py'];

        for (const imp of imports) {
            if (!imp.startsWith('.')) {
                continue;
            }
            const resolved = path.resolve(sourceDir, imp);
            if (!resolved.startsWith(workspacePath)) {
                continue;
            }
            if (discoveredFiles.has(resolved)) {
                continue;
            }
            const ext = path.extname(resolved);
            if (ext) {
                discoveredFiles.add(resolved);
                discoveredDirs.add(path.dirname(resolved));
            } else {
                for (const e of extensions) {
                    discoveredFiles.add(resolved + e);
                }
                discoveredFiles.add(path.join(resolved, 'index.ts'));
                discoveredFiles.add(path.join(resolved, 'index.js'));
                discoveredDirs.add(resolved);
                discoveredDirs.add(path.dirname(resolved));
            }
        }
    }
}

