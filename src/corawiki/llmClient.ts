import OpenAI from 'openai';
import type { CoraWikiLLMConfig } from './types';

export interface ToolSpec {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface ChatWithToolsParams {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    tools: ToolSpec[];
}

export function createLLMClient(config: CoraWikiLLMConfig): OpenAI {
    return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        defaultHeaders: config.defaultHeaders
    });
}

export async function chatWithTools(
    client: OpenAI,
    params: ChatWithToolsParams
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return client.chat.completions.create({
        model: params.model,
        messages: params.messages,
        tools: params.tools
    });
}

