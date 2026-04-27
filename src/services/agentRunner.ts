import { generateChatName, getToolDefinitions, streamChatCompletion } from './llmService';
import { executeTool, getSystemPrompt } from './toolBridge';
import { rememberFileContent } from './streaming/oldContentCache';
import { StreamingPreviewOrchestrator } from './streaming/streamingPreviewOrchestrator';
import type { LlmHistoryMessage, Message, Provider, ToolCall, ToolCallStreamingPreview } from '../types';

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

export function applyStreamingPreview(
  messages: Message[],
  assistantId: string,
  toolIndex: number,
  preview: ToolCallStreamingPreview,
): Message[] {
  return messages.map((m) => {
    if (m.id !== assistantId) return m;
    const toolCalls = (m.toolCalls ?? []).map((tc) =>
      tc.index === toolIndex ? { ...tc, streamingPreview: preview } : tc,
    );
    return { ...m, toolCalls };
  });
}

function isReadToolName(name: string | undefined): boolean {
  return name === 'Read' || name === 'ReadFile';
}

function extractReadResult(output: unknown): { filePath: string; content: string } | null {
  if (!output || typeof output !== 'object') return null;
  const obj = output as { filePath?: unknown; content?: unknown };
  if (typeof obj.filePath !== 'string' || typeof obj.content !== 'string') return null;
  return { filePath: obj.filePath, content: obj.content };
}

interface RunnerParams {
  provider: Provider;
  content: string;
  chatId: string;
  requestController: AbortController;
  isFirstMessage: boolean;
  /**
   * Read the latest YOLO setting from the renderer. The closure must call this
   * each time it's about to ask for confirmation so toggling YOLO ON in the
   * middle of a long agent run takes effect on subsequent rw tool calls.
   */
  getYoloMode: () => boolean;
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
    getYoloMode,
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

  const systemPromptText = await getSystemPrompt(chatId);
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

    const previewOrchestrator = new StreamingPreviewOrchestrator((toolIndex, preview) => {
      if (!shouldProcessUpdate()) return;
      workingMessages = applyStreamingPreview(workingMessages, assistantId, toolIndex, preview);
      onMessages(workingMessages);
    });

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

          const merged = finalToolCalls.get(toolCall.index);
          previewOrchestrator.ingestDelta(toolCall.index, merged?.function?.name, merged?.function?.arguments);
        },
        onDone: async (usage) => {
          // Make sure the orchestrator has seen every tool call's final args at
          // least once — guards against providers that send args in a single
          // chunk that arrives outside the rAF window.
          for (const finalTc of finalToolCalls.values()) {
            previewOrchestrator.ingestDelta(
              finalTc.index,
              finalTc.function?.name,
              finalTc.function?.arguments,
            );
          }
          previewOrchestrator.flushSync();
          previewOrchestrator.dispose();
          if (!shouldProcessUpdate()) return;

          // Carry over streamingPreview that the orchestrator dispatched into
          // workingMessages so it survives the rebuild from `finalToolCalls`.
          const lastWorkingAssistant = workingMessages.find((m) => m.id === assistantId);
          const previewByIndex = new Map<number, NonNullable<ToolCall['streamingPreview']>>();
          lastWorkingAssistant?.toolCalls?.forEach((tc) => {
            if (tc.streamingPreview) previewByIndex.set(tc.index, tc.streamingPreview);
          });

          const finalToolCallsList: ToolCall[] = Array.from(finalToolCalls.values()).map((tc) => {
            const preview = previewByIndex.get(tc.index);
            return preview ? { ...tc, streamingPreview: preview } : tc;
          });
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

              const output = await executeTool(tc.function!.name!, args, { chatId });
              const toolDef = toolDefinitions.find((t) => t.function?.name === tc.function?.name);
              const toolMode = toolDef?.mode ?? 'ro';

              // The IPC handler returns `{ error: string }` on schema validation
              // failure instead of throwing. Surface it as a real error so we don't
              // pop the confirmation dialog with a half-empty `output`.
              if (output && typeof output === 'object' && 'error' in output && typeof (output as { error: unknown }).error === 'string') {
                throw new Error((output as { error: string }).error);
              }

              if (isReadToolName(tc.function?.name)) {
                const readData = extractReadResult(output);
                if (readData) rememberFileContent(readData.filePath, readData.content);
              }

              currentMessages[tcIndexInMsg] = {
                ...currentMessages[tcIndexInMsg],
                toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map((t) =>
                  t.index === tc.index ? { ...t, result: { status: 'success', output } } : t,
                ),
              };
              if (!shouldProcessUpdate()) return;
              onMessages([...currentMessages]);

              if (toolMode === 'rw' && !getYoloMode()) {
                const decision = await askConfirmation(tc, output);
                if (decision.approved) {
                  // Re-issue the tool with the model's original args plus
                  // apply:true so each rw tool's own input shape is preserved
                  // (Write expects {file_path, content}, Edit expects
                  // {file_path, old_string, new_string, replace_all}).
                  const committedOutput = await executeTool(tc.function!.name!, {
                    ...args,
                    apply: true,
                  }, { chatId });

                  if (committedOutput?.filePath && typeof committedOutput.content === 'string') {
                    rememberFileContent(committedOutput.filePath, committedOutput.content);
                  }

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
                    ? await executeTool(tc.function!.name!, { ...args, apply: true }, { chatId })
                    : output;

                if (toolMode === 'rw' && finalOutput?.filePath && typeof finalOutput.content === 'string') {
                  rememberFileContent(finalOutput.filePath, finalOutput.content);
                }

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
          previewOrchestrator.dispose();
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
