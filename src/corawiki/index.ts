import { ResearchController, type RunResearchOptions } from './researchController';
import type { ResearchResult } from './types';

export async function runCoraWikiResearch(
    query: string,
    workspacePath: string,
    options: RunResearchOptions = {}
): Promise<ResearchResult> {
    const controller = new ResearchController(options);
    return controller.run(query, workspacePath);
}

export * from './types';
export * from './tools';
export * from './llmClient';

