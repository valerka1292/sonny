import type { LlmHistoryMessage, Provider } from '../types';

export interface StreamCallbacks {
  onContent: (text: string) => void;
  onThinking: (text: string) => void;
  onToolCall: (toolCall: ToolCallDelta) => void;
  onDone: (usage?: CompletionUsage) => void;
  onError: (error: unknown) => void;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface CompletionUsage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
}

interface CompletionChunkChoice {
  delta?: {
    content?: string;
    reasoning_content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason?: string;
}

interface CompletionChunk {
  choices?: CompletionChunkChoice[];
  usage?: CompletionUsage;
}

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const availableSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (availableSignals.length === 0) return undefined;

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(availableSignals);
  }

  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(source.reason ?? new DOMException('Operation aborted', 'AbortError'));
    }
  };

  for (const signal of availableSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    signal.addEventListener('abort', () => abortFrom(signal), { once: true });
  }

  return controller.signal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCompletionChunk(raw: string): CompletionChunk | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    const chunk: CompletionChunk = {};
    if (Array.isArray(parsed.choices)) chunk.choices = parsed.choices as CompletionChunkChoice[];
    if (isRecord(parsed.usage)) {
      const usage = parsed.usage as Record<string, unknown>;
      if (typeof usage.completion_tokens === 'number' && typeof usage.prompt_tokens === 'number' && typeof usage.total_tokens === 'number') {
        chunk.usage = {
          completion_tokens: usage.completion_tokens,
          prompt_tokens: usage.prompt_tokens,
          total_tokens: usage.total_tokens,
        };
      }
    }
    return chunk;
  } catch {
    return null;
  }
}

const SET_DIALOG_NAME_TOOL = {
  type: 'function' as const,
  function: {
    name: 'setDialogName',
    description: 'Set a short human-readable title for this chat (max 6 words).',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'A concise conversation title.' } },
      required: ['name'],
    },
  },
};

import { listTools } from './toolBridge';

export async function getToolDefinitions(): Promise<any[]> {
  const tools = await listTools();
  return tools.map(t => ({
    type: 'function' as const,
    mode: t.mode,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

export async function streamChatCompletion(
  provider: Provider,
  messages: LlmHistoryMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  tools?: unknown[],
): Promise<void> {
  const url = `${provider.baseUrl}/chat/completions`;
  console.log(`[LLM] Starting stream: ${provider.model}`);

  const stallController = new AbortController();
  const STALL_TIMEOUT_MS = 30000;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      console.error('[LLM] Stream stalled (30s)');
      stallController.abort(new Error('Stream stalled: no data for 30s'));
    }, STALL_TIMEOUT_MS);
  };

  // Modern AbortSignal.any (Chrome 116+) or fallback
  const combinedSignal = combineSignals([signal, stallController.signal]);

  const body = {
    model: provider.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    tools: tools || undefined,
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let doneCalled = false;

  const safeDone = (usage?: CompletionUsage) => {
    if (!doneCalled) {
      console.log('[LLM] Stream complete', usage || '');
      doneCalled = true;
      if (stallTimer) clearTimeout(stallTimer);
      callbacks.onDone(usage);
    }
  };

  try {
    resetStallTimer();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    const accumulatedToolCalls: Record<number, ToolCallDelta> = {};
    let lastUsage: CompletionUsage | undefined;

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) return;
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === '[DONE]') {
        safeDone(lastUsage);
        return;
      }

      const parsed = parseCompletionChunk(jsonStr);
      if (!parsed) return;
      if (parsed.usage) lastUsage = parsed.usage;

      const choice = parsed.choices?.[0];
      if (!choice?.delta) return;

      if (choice.delta.reasoning_content) callbacks.onThinking(choice.delta.reasoning_content);
      if (choice.delta.content) callbacks.onContent(choice.delta.content);
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index;
          if (!accumulatedToolCalls[idx]) {
            accumulatedToolCalls[idx] = { index: idx, id: tc.id, function: { name: tc.function?.name, arguments: '' } };
          }
          if (tc.function?.name) accumulatedToolCalls[idx].function!.name = tc.function.name;
          if (tc.function?.arguments) accumulatedToolCalls[idx].function!.arguments! += tc.function.arguments;
          callbacks.onToolCall({ ...accumulatedToolCalls[idx] });
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      resetStallTimer(); // Reset on every chunk
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    }

    if (buffer.trim()) processLine(buffer);
    safeDone(lastUsage);
  } catch (error: any) {
    if (stallTimer) clearTimeout(stallTimer);
    if (error.name === 'AbortError') {
      console.log('[LLM] Stream aborted');
      safeDone();
    } else {
      console.error('[LLM] Stream error:', error);
      callbacks.onError(error);
    }
  } finally {
    if (reader) reader.cancel().catch(() => {});
  }
}

export async function generateChatName(provider: Provider, firstUserMessage: string, signal?: AbortSignal): Promise<string> {
  console.log('[LLM] Generating chat name...');
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      signal,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You name conversations. Always call setDialogName with a short title (max 6 words, no quotes).' },
          { role: 'user', content: firstUserMessage },
        ],
        tools: [SET_DIALOG_NAME_TOOL],
        tool_choice: { type: 'function', function: { name: 'setDialogName' } },
        stream: false,
      }),
    });

    if (!response.ok) return 'Untitled Chat';
    const payload = await response.json();
    const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return 'Untitled Chat';
    const parsed = JSON.parse(args);
    return (parsed.name || 'Untitled Chat').trim().slice(0, 60);
  } catch (e) {
    console.error('[LLM] generateChatName error:', e);
    return 'Untitled Chat';
  }
}

export async function testProviderStream(provider: Provider, signal?: AbortSignal): Promise<boolean> {
  const timeoutSignal = AbortSignal.timeout(15000); // Node 17.3+ / Chrome 103+
  const combinedSignal = combineSignals([signal, timeoutSignal]);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'Send OK.' }],
        stream: true,
        max_tokens: 8,
      }),
      signal: combinedSignal,
    });
    return response.ok;
  } catch {
    return false;
  }
}
