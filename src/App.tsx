import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MessageList from './components/MessageList';
import InputArea from './components/InputArea';
import SettingsModal from './components/SettingsModal';
import Titlebar from './components/Titlebar';
import { AgentMode, LlmHistoryMessage, Message, ToolCall } from './types';
import { generateChatName, getToolDefinitions, streamChatCompletion } from './services/llmService';
import { useProviders } from './hooks/useProviders';
import { useChats } from './hooks/useChats';
import { executeTool, getSystemPrompt } from './services/toolBridge';

const MAX_TOOL_ITERATIONS = 10;

function applyToolCallDelta(messages: Message[], assistantId: string, toolCall: ToolCall): Message[] {
  return messages.map((m) => {
    if (m.id !== assistantId) return m;
    const toolCalls = [...(m.toolCalls || [])];
    const idx = toolCalls.findIndex((tc) => tc.index === toolCall.index);
    if (idx >= 0) toolCalls[idx] = { ...toolCalls[idx], ...toolCall };
    else toolCalls.push(toolCall);
    return { ...m, toolCalls };
  });
}

export default function App() {
  const {
    chats,
    isLoading,
    activeChatId,
    activeChatIdRef,
    messages,
    setMessages,
    llmHistory,
    setLlmHistory,
    contextTokensUsed,
    setContextTokensUsed,
    messagesRef,
    llmHistoryRef,
    contextTokensUsedRef,
    isTyping,
    setIsTyping,
    switchChat,
    loadChat,
    newChat,
    createChat,
    renameChat,
    deleteChat,
    persistChatData,
    scheduleAutoSave,
  } = useChats();

  const [mode, setMode] = useState<AgentMode>('Chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const { activeProvider } = useProviders();
  const pendingRequestControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const cancelPendingRequest = useCallback(() => {
    console.log('[App] Cancelling pending request');
    pendingRequestControllerRef.current?.abort();
    pendingRequestControllerRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelPendingRequest();
    };
  }, [cancelPendingRequest]);

  const handleSend = useCallback(
    async (content: string) => {
      console.log(`[App] handleSend triggered: "${content.slice(0, 50)}..."`);
      if (!activeProvider) {
        console.warn('[App] No active provider, aborting send');
        return;
      }

      cancelPendingRequest();
      const requestController = new AbortController();
      pendingRequestControllerRef.current = requestController;

      try {
        let chatId = activeChatIdRef.current;
        if (!chatId) {
          console.log('[App] No active chat, creating new one');
          chatId = await createChat();
        }

        const chatIdSnapshot = chatId;
        const existingMessages = [...messagesRef.current];
        const isFirstMessage = existingMessages.length === 0;

        const userMsg: Message = {
          id: Date.now().toString(),
          role: 'user',
          content,
          timestamp: new Date(),
        };

        console.log(`[App] Adding user message to chat ${chatIdSnapshot}`);
        let currentMessages = [...existingMessages, userMsg];
        setMessages(currentMessages);

        const systemPromptText = await getSystemPrompt();
        const currentLlmHistory: LlmHistoryMessage[] = [...llmHistoryRef.current, { role: 'user', content }];

        let toolIteration = 0;

        const runIteration = async (history: LlmHistoryMessage[]) => {
        const shouldProcessUpdate = () =>
          isMountedRef.current &&
          !requestController.signal.aborted &&
          activeChatIdRef.current === chatIdSnapshot;

        if (toolIteration++ >= MAX_TOOL_ITERATIONS) {
          console.error('[App] Max tool iterations reached');
          if (shouldProcessUpdate()) setIsTyping(false);
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
        setMessages(workingMessages);
        setIsTyping(true);

        let finalAssistantContent = '';
        let finalAssistantThinking = '';
        const finalToolCalls = new Map<number, ToolCall>();
        const toolDefinitions = await getToolDefinitions();

        const historyForLLM: LlmHistoryMessage[] = [{ role: 'system', content: systemPromptText }, ...history];

        console.log(`[App] Starting iteration ${toolIteration}...`);
        await streamChatCompletion(
          activeProvider,
          historyForLLM,
          {
            onContent: (text) => {
              if (!shouldProcessUpdate()) return;
              finalAssistantContent += text;
              workingMessages = workingMessages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + text } : m,
              );
              setMessages(workingMessages);
              scheduleAutoSave();
            },
            onThinking: (text) => {
              if (!shouldProcessUpdate()) return;
              finalAssistantThinking += text;
              workingMessages = workingMessages.map((m) =>
                m.id === assistantId ? { ...m, thinking: (m.thinking ?? '') + text } : m,
              );
              setMessages(workingMessages);
              scheduleAutoSave();
            },
            onToolCall: (toolCall) => {
              if (!shouldProcessUpdate()) return;
              const existing = finalToolCalls.get(toolCall.index) || {};
              finalToolCalls.set(toolCall.index, { ...existing, ...toolCall });

              workingMessages = applyToolCallDelta(workingMessages, assistantId, toolCall);
              setMessages(workingMessages);
              scheduleAutoSave();
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
              setMessages(currentMessages);
              
              // Correct LLM History update
              const historyWithAssistant: LlmHistoryMessage[] = [...history, {
                role: 'assistant', 
                content: finalAssistantContent || '', 
                ...(finalToolCallsList.length > 0 ? { tool_calls: finalToolCallsList.map(tc => ({
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.function?.name,
                    arguments: tc.function?.arguments
                  }
                })) } : {})
              }];
              
              if (usage?.total_tokens) setContextTokensUsed(usage.total_tokens);

              if (finalToolCallsList.length > 0) {
                console.log(`[App] Executing ${finalToolCallsList.length} tools...`);
                const toolResultsHistory = [...historyWithAssistant];
                
                for (const tc of finalToolCallsList) {
                  const tcIndexInMsg = currentMessages.length - 1;
                  try {
                    currentMessages[tcIndexInMsg] = {
                      ...currentMessages[tcIndexInMsg],
                      toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map(t => 
                        t.index === tc.index ? { ...t, result: { status: 'running' } } : t
                      )
                    };
                    if (!shouldProcessUpdate()) return;
                    setMessages([...currentMessages]);

                    const args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
                    const output = await executeTool(tc.function!.name!, args);
                    
                    currentMessages[tcIndexInMsg] = {
                      ...currentMessages[tcIndexInMsg],
                      toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map(t => 
                        t.index === tc.index ? { ...t, result: { status: 'success', output } } : t
                      )
                    };
                    
                    // FIXED: Correct tool message format
                    toolResultsHistory.push({ 
                      role: 'tool', 
                      tool_call_id: tc.id, 
                      content: typeof output === 'string' ? output : JSON.stringify(output) 
                    });
                  } catch (error: any) {
                    currentMessages[tcIndexInMsg] = {
                      ...currentMessages[tcIndexInMsg],
                      toolCalls: currentMessages[tcIndexInMsg].toolCalls?.map(t => 
                        t.index === tc.index ? { ...t, result: { status: 'error', error: error.message } } : t
                      )
                    };
                    toolResultsHistory.push({ 
                      role: 'tool', 
                      tool_call_id: tc.id, 
                      content: `Error: ${error.message}` 
                    });
                  }
                  if (!shouldProcessUpdate()) return;
                  setMessages([...currentMessages]);
                }

                if (!shouldProcessUpdate()) return;
                await runIteration(toolResultsHistory);
              } else {
                if (!shouldProcessUpdate()) return;
                setIsTyping(false);
                setLlmHistory(historyWithAssistant);
                await persistChatData(chatIdSnapshot, currentMessages, historyWithAssistant, usage?.total_tokens ?? contextTokensUsedRef.current);
                
                if (isFirstMessage) {
                  const title = await generateChatName(activeProvider, content, requestController.signal);
                  if (activeChatIdRef.current === chatIdSnapshot) await renameChat(chatIdSnapshot, title);
                }
              }
            },
            onError: async (error: any) => {
              console.error('[App] Stream error:', error);
              if (!shouldProcessUpdate()) return;
              setIsTyping(false);
              const errorAssistantMsg = {
                ...assistantMsg,
                content: finalAssistantContent || `Error: ${error.message}`,
                thinking: finalAssistantThinking,
                toolCalls: Array.from(finalToolCalls.values()),
              };
              const erroredMessages = [...currentMessages, errorAssistantMsg];
              setMessages(erroredMessages);
              const erroredHistory = [...history, { role: 'assistant', content: errorAssistantMsg.content }];
              setLlmHistory(erroredHistory);
              await persistChatData(chatIdSnapshot, erroredMessages, erroredHistory, contextTokensUsedRef.current);
            },
          },
          requestController.signal,
          toolDefinitions
        );
        };

        await runIteration(currentLlmHistory);
      } catch (error) {
        console.error('[App] Failed to process send flow', error);
        setIsTyping(false);
      } finally {
        if (pendingRequestControllerRef.current === requestController) {
          pendingRequestControllerRef.current = null;
        }
      }
    },
    [
      activeChatIdRef, activeProvider, cancelPendingRequest, createChat, 
      persistChatData, renameChat, scheduleAutoSave, messagesRef, 
      llmHistoryRef, contextTokensUsedRef, setContextTokensUsed, 
      setIsTyping, setLlmHistory, setMessages
    ],
  );

  const handleNewChat = useCallback(async () => {
    cancelPendingRequest();
    await newChat();
  }, [cancelPendingRequest, newChat]);

  const handleSwitchChat = useCallback(async (chatId: string) => {
    cancelPendingRequest();
    await switchChat(chatId);
  }, [cancelPendingRequest, switchChat]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    cancelPendingRequest();
    await deleteChat(chatId);
  }, [cancelPendingRequest, deleteChat]);


  const handleRenameChat = useCallback(async () => {
    if (!activeChatId) return;
    const currentTitle = chats.find((chat) => chat.id === activeChatId)?.title ?? 'Untitled Chat';
    const nextTitle = window.prompt('Rename chat', currentTitle);
    if (nextTitle === null) return;
    await renameChat(activeChatId, nextTitle);
  }, [activeChatId, chats, renameChat]);

  const chatTitle = chats.find((chat) => chat.id === activeChatId)?.title ?? 'Untitled Chat';

  return (
    <div className="flex h-screen w-full select-none overflow-hidden bg-bg-0 text-text-primary">
      <Sidebar
        activeChatId={activeChatId ?? ''}
        chats={chats}
        isLoading={isLoading}
        onNewChat={handleNewChat}
        onSelectChat={handleSwitchChat}
        onDeleteChat={handleDeleteChat}
        onSettingsOpen={() => setIsSettingsOpen(true)}
      />

      <main className="relative flex h-full flex-1 flex-col overflow-hidden">
        <Titlebar chatTitle={chatTitle} onRename={handleRenameChat} />

        <MessageList messages={messages} isTyping={isTyping} />

        <InputArea
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          hasProvider={activeProvider !== null}
          isAgentRunning={isAgentRunning}
          onToggleAgent={() => setIsAgentRunning(!isAgentRunning)}
          contextTokensUsed={contextTokensUsed}
        />

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </main>
    </div>
  );
}
