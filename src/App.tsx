import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MessageList from './components/MessageList';
import InputArea from './components/InputArea';
import SettingsModal from './components/SettingsModal';
import Titlebar from './components/Titlebar';
import { AgentMode, LlmHistoryMessage, Message, ToolCall } from './types';
import { useProviders } from './hooks/useProviders';
import { useChats } from './hooks/useChats';
import { runAgentConversation } from './services/agentRunner';
import { finalizeStoppedRun, reconstructLlmHistory, STOP_GENERATION_ERROR } from './services/stopFinalizer';
import type { AskUserQuestion, AskUserQuestionAnswers } from './types/askUserQuestion';

export default function App() {
  const {
    chats,
    isLoading,
    activeChatId,
    activeChatIdRef,
    messages,
    setMessages,
    setLlmHistory,
    contextTokensUsed,
    setContextTokensUsed,
    messagesRef,
    llmHistoryRef,
    contextTokensUsedRef,
    isTyping,
    setIsTyping,
    switchChat,
    newChat,
    createChat,
    renameChat,
    deleteChat,
    togglePin,
    persistChatData,
    scheduleAutoSave,
  } = useChats();

  const [mode, setMode] = useState<AgentMode>('Chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [yoloMode, setYoloMode] = useState(false);
  const yoloModeRef = useRef(yoloMode);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolCall: ToolCall;
    output: any;
  } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{
    toolCall: ToolCall;
    questions: AskUserQuestion[];
  } | null>(null);
  const { activeProvider } = useProviders();
  const pendingRequestControllerRef = useRef<AbortController | null>(null);
  const confirmationResolverRef = useRef<((value: { approved: boolean; reason?: string }) => void) | null>(null);
  // Resolver for an in-flight AskUserQuestion. Pattern mirrors the
  // confirmation resolver: the runner awaits a Promise; we resolve it
  // here when the user submits answers, declines, or hits Stop.
  const questionResolverRef = useRef<
    | ((value: { declined: false; answers: AskUserQuestionAnswers } | { declined: true; reason?: string }) => void)
    | null
  >(null);
  const isMountedRef = useRef(true);

  const handleYoloModeChange = useCallback((next: boolean) => {
    setYoloMode(next);
    yoloModeRef.current = next;
    // If a confirmation dialog was already showing when the user flipped YOLO
    // ON, auto-approve it so the agent can proceed without another click. The
    // agent's next rw call this turn will also skip confirmation thanks to
    // the ref-based getYoloMode().
    if (next && confirmationResolverRef.current) {
      const resolver = confirmationResolverRef.current;
      confirmationResolverRef.current = null;
      setPendingConfirmation(null);
      resolver({ approved: true });
    }
  }, []);

  useEffect(() => {
    yoloModeRef.current = yoloMode;
  }, [yoloMode]);

  const cancelPendingRequest = useCallback(() => {
    console.log('[App] Cancelling pending request');
    pendingRequestControllerRef.current?.abort();
    pendingRequestControllerRef.current = null;
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current({ approved: false, reason: 'Request cancelled by user.' });
      confirmationResolverRef.current = null;
    }
    if (questionResolverRef.current) {
      questionResolverRef.current({ declined: true, reason: 'Request cancelled by user.' });
      questionResolverRef.current = null;
    }
    setPendingConfirmation(null);
    setPendingQuestion(null);
  }, []);

  const handleStop = useCallback(async () => {
    console.log('[App] User pressed Stop');
    // 1) Unblock any pending confirmation so the runner can return
    //    immediately; the resolver answers "rejected with stop reason" so
    //    that flow path won't re-execute the tool.
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current({ approved: false, reason: STOP_GENERATION_ERROR });
      confirmationResolverRef.current = null;
    }
    // Same for an in-flight AskUserQuestion: hand back declined-with-stop
    // so the runner records a structured tool error and returns from the
    // tool loop cleanly.
    if (questionResolverRef.current) {
      questionResolverRef.current({ declined: true, reason: STOP_GENERATION_ERROR });
      questionResolverRef.current = null;
    }
    setPendingConfirmation(null);
    setPendingQuestion(null);

    // 2) Abort the network/IPC stream. From this point shouldProcessUpdate()
    //    inside agentRunner returns false, so no more setMessages will
    //    fire from the runner.
    pendingRequestControllerRef.current?.abort();
    pendingRequestControllerRef.current = null;

    // 3) Yield one microtask so any already-queued onMessages from before
    //    the abort lands in messagesRef.
    await Promise.resolve();

    const chatIdSnapshot = activeChatIdRef.current;
    if (!chatIdSnapshot) {
      setIsTyping(false);
      return;
    }

    // 4) Read latest UI snapshot, normalize in-flight tool calls into a
    //    structured "User stopped generation" error.
    const finalizedMessages = finalizeStoppedRun(messagesRef.current);
    setMessages(finalizedMessages);

    // 5) Rebuild the LLM-visible history from the finalized messages so the
    //    next user message has a valid handshake (every tool_call_id paired
    //    with a tool result, no dangling assistant tool_calls).
    const rebuiltHistory = reconstructLlmHistory(finalizedMessages);
    setLlmHistory(rebuiltHistory);

    // 6) Persist to disk so the stopped state survives a chat switch / reload.
    await persistChatData(
      chatIdSnapshot,
      finalizedMessages,
      rebuiltHistory,
      contextTokensUsedRef.current,
    );

    setIsTyping(false);
  }, [
    activeChatIdRef,
    messagesRef,
    contextTokensUsedRef,
    persistChatData,
    setIsTyping,
    setLlmHistory,
    setMessages,
  ]);

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

        let currentMessages = [...existingMessages, userMsg];
        setMessages(currentMessages);

        const currentLlmHistory: LlmHistoryMessage[] = [...llmHistoryRef.current, { role: 'user', content }];

        await runAgentConversation({
          provider: activeProvider,
          content,
          chatId: chatIdSnapshot,
          requestController,
          isFirstMessage,
          getYoloMode: () => yoloModeRef.current,
          history: currentLlmHistory,
          messages: currentMessages,
          activeChatIdRef,
          isMountedRef,
          onMessages: setMessages,
          onTyping: setIsTyping,
          onHistory: setLlmHistory,
          onTokens: setContextTokensUsed,
          onAutosave: scheduleAutoSave,
          onPersist: async (nextMessages, nextHistory, tokens) => {
            await persistChatData(chatIdSnapshot, nextMessages, nextHistory, tokens);
          },
          onRenameChat: async (title) => {
            await renameChat(chatIdSnapshot, title);
          },
          askConfirmation: async (toolCall, output) => {
            return new Promise<{ approved: boolean; reason?: string }>((resolve) => {
              confirmationResolverRef.current = (decision) => {
                confirmationResolverRef.current = null;
                setPendingConfirmation(null);
                resolve(decision);
              };
              setPendingConfirmation({ toolCall, output });
            });
          },
          askQuestion: async (toolCall, questions) => {
            return new Promise((resolve) => {
              questionResolverRef.current = (answer) => {
                questionResolverRef.current = null;
                setPendingQuestion(null);
                resolve(answer);
              };
              setPendingQuestion({ toolCall, questions });
            });
          },
          getContextTokens: () => contextTokensUsedRef.current,
        });
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
      activeChatIdRef,
      activeProvider,
      cancelPendingRequest,
      createChat,
      llmHistoryRef,
      messagesRef,
      contextTokensUsedRef,
      setMessages,
      setIsTyping,
      setLlmHistory,
      setContextTokensUsed,
      scheduleAutoSave,
      persistChatData,
      renameChat,
    ],
  );

  const handleApproveConfirmation = useCallback(() => {
    if (!confirmationResolverRef.current) return;
    confirmationResolverRef.current({ approved: true });
    confirmationResolverRef.current = null;
  }, []);

  const handleRejectConfirmation = useCallback((reason: string) => {
    if (!confirmationResolverRef.current) return;
    confirmationResolverRef.current({ approved: false, reason });
    confirmationResolverRef.current = null;
  }, []);

  const handleAnswerQuestion = useCallback((answers: AskUserQuestionAnswers) => {
    if (!questionResolverRef.current) return;
    questionResolverRef.current({ declined: false, answers });
    questionResolverRef.current = null;
  }, []);

  const handleDeclineQuestion = useCallback(() => {
    if (!questionResolverRef.current) return;
    questionResolverRef.current({ declined: true, reason: 'User declined to answer the questions' });
    questionResolverRef.current = null;
  }, []);

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

  const handleTogglePin = useCallback(async (chatId: string, pinned: boolean) => {
    await togglePin(chatId, pinned);
  }, [togglePin]);


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
        onTogglePin={handleTogglePin}
        onSettingsOpen={() => setIsSettingsOpen(true)}
      />

      <main className="relative flex h-full flex-1 flex-col overflow-hidden">
        <Titlebar chatTitle={chatTitle} onRename={handleRenameChat} />

        <MessageList
          messages={messages}
          isTyping={isTyping}
          pendingConfirmation={pendingConfirmation}
          onApprove={handleApproveConfirmation}
          onReject={handleRejectConfirmation}
          pendingQuestion={pendingQuestion}
          onAnswerQuestion={handleAnswerQuestion}
          onDeclineQuestion={handleDeclineQuestion}
        />

        <InputArea
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isTyping}
          hasProvider={activeProvider !== null}
          isAgentRunning={isAgentRunning}
          onToggleAgent={() => setIsAgentRunning(!isAgentRunning)}
          contextTokensUsed={contextTokensUsed}
          yoloMode={yoloMode}
          onYoloModeChange={handleYoloModeChange}
          activeChatId={activeChatId ?? null}
          disabled={Boolean(pendingConfirmation) || Boolean(pendingQuestion)}
        />

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </main>
    </div>
  );
}
