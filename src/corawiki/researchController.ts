import * as path from 'path';
import { listDir, readFullCode, readSkeleton } from './tools';
import type { ResearchResult, ResearchStep } from './types';

export interface RunResearchOptions {
    maxSteps?: number;
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

    constructor(options: RunResearchOptions = {}) {
        this.maxSteps = options.maxSteps ?? 15;
    }

    async run(query: string, workspacePath: string): Promise<ResearchResult> {
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
}

