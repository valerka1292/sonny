import { generateChatName, getToolDefinitions, streamChatCompletion } from './llmService';
import { executeTool, getSystemPrompt } from './toolBridge';
import type { LlmHistoryMessage, Message, Provider, ToolCall } from '../types';

export const MAX_TOOL_ITERATIONS = 10;

export function applyToolCallDelta(messages: Message[], assistantId: string, toolCall: ToolCall): Message[] {
  return messages.map((m) => {
    if (m.id !== assistantId) return m;
    const toolCalls = [...(m.toolCalls || [])];
    const idx = toolCalls.findIndex((tc) => tc.index === toolCall.index);
    if (idx >= 0) toolCalls[idx] = { ...toolCalls[idx], ...toolCall };
    else toolCalls.push(toolCall);
    return { ...m, toolCalls };
  });
}

interface RunnerParams {
  provider: Provider;
  content: string;
  chatId: string;
  requestController: AbortController;
  isFirstMessage: boolean;
  yoloMode: boolean;
  history: LlmHistoryMessage[];
  messages: Message[];
  activeChatIdRef: { current: string | null };
  isMountedRef: { current: boolean };
  onMessages: (messages: Message[]) => void;
  onTyping: (typing: boolean) => void;
  onHistory: (history: LlmHistoryMessage[]) => void;
  onTokens: (tokens: number) => void;
  onAutosave: () => void;
  onPersist: (messages: Message[], history: LlmHistoryMessage[], tokens: number) => Promise<void>;
  onRenameChat: (title: string) => Promise<void>;
  askConfirmation: (toolCall: ToolCall, output: any) => Promise<{ approved: boolean; reason?: string }>;
  getContextTokens: () => number;
}

export async function runAgentConversation(params: RunnerParams): Promise<void> {
  const {
    provider,
    content,
    chatId,
    requestController,
    isFirstMessage,
    yoloMode,
    history,
    messages,
    activeChatIdRef,
    isMountedRef,
    onMessages,
    onTyping,
    onHistory,
    onTokens,
    onAutosave,
    onPersist,
    onRenameChat,
    askConfirmation,
    getContextTokens,
  } = params;

  const shouldProcessUpdate = () =>
    isMountedRef.current && !requestController.signal.aborted && activeChatIdRef.current === chatId;

  const systemPromptText = await getSystemPrompt();
  const toolDefinitions = await getToolDefinitions();

  let toolIteration = 0;
  let currentMessages = messages;

  const runIteration = async (workingHistory: LlmHistoryMessage[]) => {
    if (toolIteration++ >= MAX_TOOL_ITERATIONS) {
      if (shouldProcessUpdate()) onTyping(false);
      return;
    }

    const assistantId = (Date.now() + toolIteration).toString();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      thinking: '',
      toolCalls: [],
    };

    let workingMessages = [...currentMessages, assistantMsg];
    if (!shouldProcessUpdate()) return;

    onMessages(workingMessages);
    onTyping(true);

    let finalAssistantContent = '';
    let finalAssistantThinking = '';
    const finalToolCalls = new Map<number, ToolCall>();
    const historyForLLM: LlmHistoryMessage[] = [{ role: 'system', content: systemPromptText }, ...workingHistory];

    await streamChatCompletion(
      provider,
      historyForLLM,
      {
        onContent: (text) => {
          if (!shouldProcessUpdate()) return;
          finalAssistantContent += text;
          workingMessages = workingMessages.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m));
          onMessages(workingMessages);
          onAutosave();
        },
        onThinking: (text) => {
          if (!shouldProcessUpdate()) return;
          finalAssistantThinking += text;
          workingMessages = workingMessages.map((m) =>
            m.id === assistantId ? { ...m, thinking: (m.thinking ?? '') + text } : m,
          );
          onMessages(workingMessages);
          onAutosave();
        },
        onToolCall: (toolCall) => {
          if (!shouldProcessUpdate()) return;
          const existing = finalToolCalls.get(toolCall.index) || {};
          finalToolCalls.set(toolCall.index, { ...existing, ...toolCall });
          workingMessages = applyToolCallDelta(workingMessages, assistantId, toolCall);
          onMessages(workingMessages);
          onAutosave();
        },
        onDone: async (usage) => {
          if (!shouldProcessUpdate()) return;

          const finalToolCallsList = Array.from(finalToolCalls.values());
          const lastAssistant: Message = {
            ...assistantMsg,
            content: finalAssistantContent,
            thinking: finalAssistantThinking,
            toolCalls: finalToolCallsList,
          };

          currentMessages = [...currentMessages, lastAssistant];
          onMessages(currentMessages);

          const historyWithAssistant: LlmHistoryMessage[] = [
            ...workingHistory,
            {
              role: 'assistant',
              content: finalAssistantContent || '',
              ...(finalToolCallsList.length > 0
                ? {
                    tool_calls: finalToolCallsList.map((tc) => ({
                      id: tc.id,
                      type: 'function',
                      function: {
                        name: tc.function?.name,
                        arguments: tc.function?.arguments,
                      },
                    })),
                  }
                : {}),
            },
          ];

          if (usage?.total_tokens) onTokens(usage.total_tokens);

          if (finalToolCallsList.length === 0) {
            if (!shouldProcessUpdate()) return;
            onTyping(false);
            onHistory(historyWithAssistant);
            await onPersist(currentMessages, historyWithAssistant, usage?.total_tokens ?? getContextTokens());
            if (isFirstMessage) {
              const title = await generateChatName(provider, content, requestController.signal);
              if (activeChatIdRef.current === chatId) await onRenameChat(title);
            }
            return;
          }

          const toolResultsHistory = [...historyWithAssistant];

          for (const tc of finalToolCallsList) {
            const tcIndexInMsg = currentMessages.length - 1;
            try {
              currentMessages[tcIndexInMsg] = {
                ...currentMessages[tcIndexInMsg],
                toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                  t.index === tc.index ? { ...t, result: { status: 'running' } } : t,
                ),
              };
              if (!shouldProcessUpdate()) return;
              onMessages([...currentMessages]);

              let args = {};
              try {
                args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
              } catch (error: any) {
                throw new Error(`Invalid JSON arguments for tool ${tc.function?.name || 'unknown'}: ${error.message}`);
              }

              const output = await executeTool(tc.function!.name!, args);
              const toolDef = toolDefinitions.find((t) => t.function?.name === tc.function?.name);
              const toolMode = toolDef?.mode ?? 'ro';

              currentMessages[tcIndexInMsg] = {
                ...currentMessages[tcIndexInMsg],
                toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                  t.index === tc.index ? { ...t, result: { status: 'success', output } } : t,
                ),
              };

              if (toolMode === 'rw' && !yoloMode) {
                const decision = await askConfirmation(tc, output);
                if (decision.approved) {
                  const committedOutput = await executeTool(tc.function!.name!, {
                    file_path: output.filePath,
                    content: output.content,
                    apply: true,
                  });

                  currentMessages[tcIndexInMsg] = {
                    ...currentMessages[tcIndexInMsg],
                    toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                      t.index === tc.index ? { ...t, result: { status: 'success', output: committedOutput } } : t,
                    ),
                  };

                  const resultContent =
                    committedOutput?.type === 'update'
                      ? `The file ${committedOutput.filePath} has been updated successfully.`
                      : `File created successfully at: ${committedOutput.filePath}`;
                  toolResultsHistory.push({ role: 'tool', tool_call_id: tc.id, content: resultContent });
                } else {
                  currentMessages[tcIndexInMsg] = {
                    ...currentMessages[tcIndexInMsg],
                    toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                      t.index === tc.index
                        ? { ...t, result: { status: 'error', error: decision.reason || 'User rejected operation' } }
                        : t,
                    ),
                  };
                  toolResultsHistory.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: `Error: User rejected the operation. Reason: ${decision.reason || 'No reason provided'}`,
                  });
                }
              } else {
                const finalOutput =
                  toolMode === 'rw'
                    ? await executeTool(tc.function!.name!, {
                        file_path: output.filePath,
                        content: output.content,
                        apply: true,
                      })
                    : output;

                currentMessages[tcIndexInMsg] = {
                  ...currentMessages[tcIndexInMsg],
                  toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                    t.index === tc.index ? { ...t, result: { status: 'success', output: finalOutput } } : t,
                  ),
                };

                toolResultsHistory.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput),
                });
              }
            } catch (error: any) {
              currentMessages[tcIndexInMsg] = {
                ...currentMessages[tcIndexInMsg],
                toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                  t.index === tc.index ? { ...t, result: { status: 'error', error: error.message } } : t,
                ),
              };
              toolResultsHistory.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${error.message}` });
            }

            if (!shouldProcessUpdate()) return;
            onMessages([...currentMessages]);
          }

          if (!shouldProcessUpdate()) return;
          await runIteration(toolResultsHistory);
        },
        onError: async (error: any) => {
          if (!shouldProcessUpdate()) return;
          onTyping(false);
          const errorAssistantMsg = {
            ...assistantMsg,
            content: finalAssistantContent || `Error: ${error.message}`,
            thinking: finalAssistantThinking,
            toolCalls: Array.from(finalToolCalls.values()),
          };
          const erroredMessages = [...currentMessages, errorAssistantMsg];
          onMessages(erroredMessages);
          const erroredHistory: LlmHistoryMessage[] = [...workingHistory, { role: 'assistant', content: errorAssistantMsg.content }];
          onHistory(erroredHistory);
          await onPersist(erroredMessages, erroredHistory, getContextTokens());
        },
      },
      requestController.signal,
      toolDefinitions,
    );
  };

  await runIteration(history);
}
