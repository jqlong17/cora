export type CodeNodeType = 'workspace' | 'directory' | 'file' | 'symbol';

export interface CodeNode {
    nodeId: string;
    type: CodeNodeType;
    path: string;
    name: string;
    signature?: string;
    hash?: string;
    summary?: string;
    children: CodeNode[];
}

export type ResearchStage = 'PLAN' | 'UPDATE' | 'FINAL';

export interface ResearchStep {
    iteration: number;
    stage: ResearchStage;
    action: string;
    input: string;
    evidence: string[];
    output: string;
}

export interface ResearchResult {
    query: string;
    startedAt: string;
    endedAt: string;
    steps: ResearchStep[];
    plan: string;
    updates: string[];
    finalConclusion: string;
    references: string[];
}

export interface CoraWikiLLMConfig {
    provider: 'kimi' | 'openai' | 'openrouter';
    baseUrl: string;
    model: string;
    apiKey: string;
    fallbackProvider?: 'openai' | 'openrouter' | 'kimi';
    defaultHeaders?: Record<string, string>;
}

