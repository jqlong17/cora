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
    debugLogPath?: string;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        cachedTokens: number;
    };
    diagrams?: string[];
    moduleSummaries?: string[];
    architectureFindings?: Array<{
        title: string;
        judgement: string;
        evidence: string[];
    }>;
    criticalFlows?: Array<{
        name: string;
        steps: string[];
        evidence: string[];
    }>;
    risks?: Array<{
        risk: string;
        impact: string;
        evidence: string[];
    }>;
    unknowns?: string[];
    promptVersion?: string;
    referenceStats?: {
        p0: number;
        p1: number;
        p2: number;
        sourceEvidenceRatio: number;
        docNoiseRatio: number;
    };
    qualityScore?: number;
}

export interface CoraWikiLLMConfig {
    provider: 'kimi' | 'openai' | 'openrouter' | 'minimax';
    baseUrl: string;
    model: string;
    apiKey: string;
    fallbackProvider?: 'openai' | 'openrouter' | 'kimi' | 'minimax';
    defaultHeaders?: Record<string, string>;
}

