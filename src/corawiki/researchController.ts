import * as path from 'path';
import { listDir, readFullCode, readSkeleton } from './tools';
import { chatWithTools, createLLMClient, type ToolSpec } from './llmClient';
import type { CoraWikiLLMConfig, ResearchResult, ResearchStep } from './types';

export interface RunResearchOptions {
    maxSteps?: number;
    llmConfig?: CoraWikiLLMConfig;
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

export class ResearchController {
    private readonly maxSteps: number;
    private readonly llmConfig?: CoraWikiLLMConfig;

    constructor(options: RunResearchOptions = {}) {
        this.maxSteps = options.maxSteps ?? 15;
        this.llmConfig = options.llmConfig;
    }

    async run(query: string, workspacePath: string): Promise<ResearchResult> {
        if (this.llmConfig?.apiKey) {
            return this.runWithLLM(query, workspacePath);
        }
        return this.runLocal(query, workspacePath);
    }

    private async runLocal(query: string, workspacePath: string): Promise<ResearchResult> {
        const startedAt = new Date().toISOString();
        const steps: ResearchStep[] = [];

        const rootEntries = await listDir(workspacePath, { maxEntries: 200 });
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
        steps.push(createStep(1, 'PLAN', 'list_dir', workspacePath, srcEvidence.slice(0, 10), plan));

        const updates: string[] = [];
        let references: string[] = [];

        if (this.maxSteps > 1 && srcEvidence.length > 0) {
            const firstEvidence = srcEvidence[0];
            try {
                const skeleton = await readSkeleton(firstEvidence);
                const update = `读取骨架：${path.basename(firstEvidence)}，提取到 ${skeleton.imports.length} 条 import，${skeleton.symbols.length} 个符号声明。`;
                updates.push(update);
                references = [skeleton.filePath];
                steps.push(createStep(2, 'UPDATE', 'read_skeleton', firstEvidence, [skeleton.filePath], update));
            } catch {
                const update = `尝试读取骨架失败：${firstEvidence}。将改用目录证据生成初步结论。`;
                updates.push(update);
                steps.push(createStep(2, 'UPDATE', 'read_skeleton', firstEvidence, [firstEvidence], update));
            }
        }

        if (this.maxSteps > 2 && fileCandidates.length > 0) {
            try {
                const snippet = await readFullCode(fileCandidates[0], { startLine: 1, endLine: 60 });
                const short = snippet.split('\n').slice(0, 3).join(' | ');
                const update = `读取源码片段：${path.basename(fileCandidates[0])}，片段摘要：${short}`;
                updates.push(update);
                references.push(fileCandidates[0]);
                steps.push(createStep(3, 'UPDATE', 'read_full_code', fileCandidates[0], [fileCandidates[0]], update));
            } catch {
                // ignore source read failures in MVP
            }
        }

        const uniqueRefs = Array.from(new Set(references));
        const finalConclusion = uniqueRefs.length > 0
            ? `已完成最小闭环研究，基于 ${uniqueRefs.length} 个证据文件形成结论。下一步建议接入真实 Tool Calling 循环与模型推理。`
            : '已完成最小闭环研究，但暂未获取足够文件证据。建议检查工作区路径或 include/exclude 配置。';

        steps.push(createStep(steps.length + 1, 'FINAL', 'finalize', query, uniqueRefs, finalConclusion));

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
        const references: string[] = [];
        let plan = '';
        let finalConclusion = '';

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
            }
        ];

        const messages: any[] = [
            {
                role: 'system',
                content:
                    '你是 CoraWiki 的代码研究 Agent。请优先通过工具读取真实代码证据，再输出结论。' +
                    '最终回答必须包含：Research Plan、Research Update、Final Conclusion 三段。'
            },
            {
                role: 'user',
                content:
                    `工作区: ${workspacePath}\n问题: ${query}\n` +
                    '你可以调用 list_dir/read_skeleton/read_full_code。请至少调用一次工具。'
            }
        ];

        for (let iteration = 1; iteration <= this.maxSteps; iteration++) {
            const response = await chatWithTools(llm, {
                model: this.llmConfig!.model,
                messages,
                tools
            });
            const msg = response.choices?.[0]?.message as any;
            if (!msg) {
                break;
            }

            const toolCalls = msg.tool_calls as any[] | undefined;
            if (toolCalls && toolCalls.length > 0) {
                messages.push({
                    role: 'assistant',
                    content: msg.content ?? '',
                    tool_calls: toolCalls
                });

                for (const call of toolCalls) {
                    const fnName = call.function?.name as string;
                    let args: any = {};
                    try {
                        args = JSON.parse(call.function?.arguments ?? '{}');
                    } catch {
                        args = {};
                    }

                    const { output, evidence } = await this.executeTool(fnName, args, workspacePath);
                    evidence.forEach(e => references.push(e));
                    updates.push(`[${fnName}] ${output.slice(0, 240)}`);
                    steps.push(
                        createStep(iteration, 'UPDATE', fnName, JSON.stringify(args), evidence, output.slice(0, 500))
                    );

                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: output
                    });
                }
                continue;
            }

            const text = (msg.content ?? '').toString().trim();
            if (!text) {
                continue;
            }

            if (!plan) {
                plan = text;
                steps.push(createStep(iteration, 'PLAN', 'llm_plan', query, Array.from(new Set(references)), text.slice(0, 500)));
            } else {
                finalConclusion = text;
                steps.push(createStep(iteration, 'FINAL', 'llm_final', query, Array.from(new Set(references)), text.slice(0, 500)));
                break;
            }

            messages.push({ role: 'assistant', content: text });
            messages.push({
                role: 'user',
                content: '请继续研究并给出 Final Conclusion，必须引用你通过工具获得的证据路径。'
            });
        }

        if (!plan) {
            plan = `围绕问题“${query}”进行工具驱动研究，优先读取真实代码证据。`;
        }
        if (!finalConclusion) {
            finalConclusion =
                '已完成研究步骤，但模型未返回明确最终结论。建议增加 maxSteps 或检查 provider/model 配置。';
        }

        return {
            query,
            startedAt,
            endedAt: new Date().toISOString(),
            steps,
            plan,
            updates,
            finalConclusion,
            references: Array.from(new Set(references))
        };
    }

    private async executeTool(
        toolName: string,
        args: Record<string, unknown>,
        workspacePath: string
    ): Promise<{ output: string; evidence: string[] }> {
        try {
            if (toolName === 'list_dir') {
                const targetPath = this.resolvePath(String(args.targetPath ?? workspacePath), workspacePath);
                const entries = await listDir(targetPath, { maxEntries: 200 });
                const evidence = entries.map(e => e.path);
                return {
                    output: JSON.stringify(entries, null, 2),
                    evidence
                };
            }

            if (toolName === 'read_skeleton') {
                const filePath = this.resolvePath(String(args.filePath ?? ''), workspacePath);
                const skeleton = await readSkeleton(filePath);
                return {
                    output: JSON.stringify(skeleton, null, 2),
                    evidence: [skeleton.filePath]
                };
            }

            if (toolName === 'read_full_code') {
                const filePath = this.resolvePath(String(args.filePath ?? ''), workspacePath);
                const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
                const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;
                const content = await readFullCode(filePath, { startLine, endLine });
                return {
                    output: content,
                    evidence: [filePath]
                };
            }

            return { output: `unknown_tool: ${toolName}`, evidence: [] };
        } catch (error) {
            return {
                output: `tool_error(${toolName}): ${String(error)}`,
                evidence: []
            };
        }
    }

    private resolvePath(inputPath: string, workspacePath: string): string {
        const normalized = path.isAbsolute(inputPath) ? inputPath : path.join(workspacePath, inputPath);
        return normalized;
    }
}

