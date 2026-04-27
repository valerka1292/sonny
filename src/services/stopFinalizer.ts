import type { LlmHistoryMessage, Message, ToolCall } from '../types';

export const STOP_GENERATION_ERROR = 'User stopped generation';

/**
 * Walk the UI message list and force any tool call that was still in-flight
 * (no `result` at all, or `result.status === 'running'`) into a structured
 * error. This is what the renderer hands to the model on the next turn so
 * the chat history doesn't carry a phantom \"running\" tool call after the
 * user has clicked Stop.
 *
 * Pure function: returns a new array, leaves the input untouched.
 */
export function finalizeStoppedRun(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (!m.toolCalls?.length) return m;
    let mutated = false;
    const nextToolCalls = m.toolCalls.map((tc) => {
      if (!tc.result || tc.result.status === 'running') {
        mutated = true;
        return {
          ...tc,
          result: { status: 'error' as const, error: STOP_GENERATION_ERROR },
        };
      }
      return tc;
    });
    return mutated ? { ...m, toolCalls: nextToolCalls } : m;
  });
}

/**
 * Convert a ToolCall (UI shape) into the OpenAI-compatible tool_calls entry
 * that the LLM history expects on an assistant message. Mirrors what
 * agentRunner does in its happy path so the rebuilt Stop history is
 * indistinguishable from a normal one.
 */
function toolCallToHistoryEntry(tc: ToolCall): {
  id: string;
  type: 'function';
  function: { name?: string; arguments?: string };
} {
  return {
    id: tc.id ?? '',
    type: 'function',
    function: {
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    },
  };
}

/**
 * Render the tool-call result content as the LLM should see it on the next
 * turn. Mirrors the runner's tool-result content rules:
 *   - success → JSON-stringified output (or the raw string if it is one)
 *   - error   → \"Error: <message>\"
 *   - running / no result → treated as the Stop sentinel
 */
function toolCallResultContent(tc: ToolCall): string {
  const result = tc.result;
  if (!result || result.status === 'running') {
    return `Error: ${STOP_GENERATION_ERROR}`;
  }
  if (result.status === 'error') {
    return `Error: ${result.error ?? 'Unknown error'}`;
  }
  const out = result.output;
  if (typeof out === 'string') return out;
  try {
    return JSON.stringify(out);
  } catch {
    return String(out);
  }
}

/**
 * Rebuild the LLM-visible history from the finalized UI message list.
 *
 * We use this on Stop because the runner only flushes its incremental
 * history snapshot at iteration boundaries (assistant-with-no-tool-calls
 * or stream-error). When the user aborts mid-iteration the persisted
 * history is stale: the latest assistant turn is missing, and its tool
 * results are missing. Instead of trying to surgically patch the history
 * snapshot, rebuild it from the UI messages — those have everything we
 * need (assistant content + thinking, tool_calls + per-call results),
 * minus the system prompt which the runner injects fresh on every turn.
 *
 * The output is guaranteed valid for OpenAI-compatible tool-calling: every
 * tool_call_id on an assistant message is followed by a `role: 'tool'`
 * entry with the same id. Stopped tool calls become a normal-looking tool
 * error so the next turn doesn't crash on a half-open handshake.
 */
export function reconstructLlmHistory(messages: Message[]): LlmHistoryMessage[] {
  const history: LlmHistoryMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const toolCalls = m.toolCalls ?? [];
      const entry: LlmHistoryMessage = {
        role: 'assistant',
        content: m.content || '',
      };
      if (toolCalls.length > 0) {
        entry.tool_calls = toolCalls.map(toolCallToHistoryEntry);
      }
      history.push(entry);
      for (const tc of toolCalls) {
        if (!tc.id) continue;
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolCallResultContent(tc),
        });
      }
    }
  }
  return history;
}
