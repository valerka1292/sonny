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
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolCall: ToolCall;
    output: any;
  } | null>(null);
  const { activeProvider } = useProviders();
  const pendingRequestControllerRef = useRef<AbortController | null>(null);
  const confirmationResolverRef = useRef<((value: { approved: boolean; reason?: string }) => void) | null>(null);
  const isMountedRef = useRef(true);

  const cancelPendingRequest = useCallback(() => {
    console.log('[App] Cancelling pending request');
    pendingRequestControllerRef.current?.abort();
    pendingRequestControllerRef.current = null;
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current({ approved: false, reason: 'Request cancelled by user.' });
      confirmationResolverRef.current = null;
    }
    setPendingConfirmation(null);
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

        let currentMessages = [...existingMessages, userMsg];
        setMessages(currentMessages);

        const currentLlmHistory: LlmHistoryMessage[] = [...llmHistoryRef.current, { role: 'user', content }];

        await runAgentConversation({
          provider: activeProvider,
          content,
          chatId: chatIdSnapshot,
          requestController,
          isFirstMessage,
          yoloMode,
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
      yoloMode,
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
        />

        <InputArea
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          hasProvider={activeProvider !== null}
          isAgentRunning={isAgentRunning}
          onToggleAgent={() => setIsAgentRunning(!isAgentRunning)}
          contextTokensUsed={contextTokensUsed}
          yoloMode={yoloMode}
          onYoloModeChange={setYoloMode}
          activeChatId={activeChatId ?? null}
          disabled={Boolean(pendingConfirmation)}
        />

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </main>
    </div>
  );
}
