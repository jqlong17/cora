import Anthropic from '@anthropic-ai/sdk';
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

function convertToAnthropicMessages(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): { system: string; messages: Anthropic.MessageParam[] } {
    let system = '';
    const anthropicMessages: Anthropic.MessageParam[] = [];
    let i = 0;
    while (i < messages.length) {
        const m = messages[i];
        if (!m || typeof m !== 'object') {
            i++;
            continue;
        }
        if (m.role === 'system') {
            const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content as { type: string; text?: string }[]).map(c => c.type === 'text' ? c.text : '').join('') : '');
            system += (system ? '\n' : '') + content;
            i++;
            continue;
        }
        if (m.role === 'user') {
            const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content as { type: string; text?: string }[]).map(c => c.type === 'text' ? c.text : '').join('') : '');
            anthropicMessages.push({ role: 'user', content: [{ type: 'text', text: content }] });
            i++;
            continue;
        }
        if (m.role === 'assistant') {
            const msg = m as { content?: string | unknown[]; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
            const contentBlocks: Anthropic.MessageParam['content'] = [];
            if (typeof msg.content === 'string' && msg.content) {
                contentBlocks.push({ type: 'text', text: msg.content });
            } else if (Array.isArray(msg.content)) {
                for (const c of msg.content as { type: string; text?: string }[]) {
                    if (c.type === 'text' && c.text) contentBlocks.push({ type: 'text', text: c.text });
                }
            }
            if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                    let input: Record<string, unknown> = {};
                    try {
                        input = JSON.parse(tc.function?.arguments ?? '{}');
                    } catch {
                        //
                    }
                    contentBlocks.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.function?.name ?? '',
                        input
                    });
                }
            }
            if (contentBlocks.length > 0) {
                anthropicMessages.push({ role: 'assistant', content: contentBlocks });
            }
            i++;
            if (i < messages.length && (messages[i] as any)?.role === 'tool') {
                const toolResults: Anthropic.ToolResultBlockParam[] = [];
                while (i < messages.length && (messages[i] as any)?.role === 'tool') {
                    const t = messages[i] as { role: 'tool'; tool_call_id: string; content: string };
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: t.tool_call_id,
                        content: typeof t.content === 'string' ? t.content : JSON.stringify(t.content)
                    });
                    i++;
                }
                anthropicMessages.push({ role: 'user', content: toolResults });
            }
            continue;
        }
        i++;
    }
    return { system, messages: anthropicMessages };
}

function convertToOpenAIResponse(
    anthropicResponse: Anthropic.Message,
    model: string
): OpenAI.Chat.Completions.ChatCompletion {
    const textParts: string[] = [];
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
    for (const block of anthropicResponse.content) {
        if (block.type === 'text') {
            textParts.push(block.text);
        } else if (block.type === 'tool_use') {
            toolCalls.push({
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) }
            });
        }
    }
    const message: OpenAI.Chat.Completions.ChatCompletionMessage = {
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('') : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        refusal: null
    };
    const usage = anthropicResponse.usage
        ? {
            prompt_tokens: anthropicResponse.usage.input_tokens,
            completion_tokens: anthropicResponse.usage.output_tokens,
            total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
        }
        : undefined;
    return {
        id: anthropicResponse.id ?? '',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message, finish_reason: 'stop', logprobs: null }],
        usage
    };
}

export async function chatWithTools(
    client: OpenAI,
    params: ChatWithToolsParams,
    config?: CoraWikiLLMConfig
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    if (config?.provider === 'minimax') {
        const anthropic = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseUrl
        });
        const { system, messages } = convertToAnthropicMessages(params.messages);
        const anthropicTools: Anthropic.Tool[] = params.tools.map(t => {
            const params = t.function.parameters as { type?: string; properties?: unknown; required?: string[] } | undefined;
            return {
                name: t.function.name,
                description: t.function.description ?? '',
                input_schema: params && typeof params === 'object' ? { ...params, type: (params.type ?? 'object') as 'object' } : { type: 'object' as const, properties: {} }
            };
        });
        const response = await anthropic.messages.create({
            model: params.model,
            max_tokens: 8192,
            system: system || undefined,
            messages,
            tools: anthropicTools.length > 0 ? anthropicTools : undefined
        });
        return convertToOpenAIResponse(response, params.model);
    }
    return client.chat.completions.create({
        model: params.model,
        messages: params.messages,
        tools: params.tools
    });
}
