import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { ChatData, ChatSession, LlmHistoryMessage, Message, StoredMessage } from '../types';
import { useChatStorage } from '../context/StorageContext';
import { OperationQueue } from '../services/operationQueue';
import { chatDataSchema } from '../shared/chatSchemas';

function generateChatId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toStoredMessage(message: Message): StoredMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.getTime(),
    thinking: message.thinking,
    toolCalls: message.toolCalls,
  };
}

function fromStoredMessage(message: StoredMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    thinking: message.thinking,
    toolCalls: message.toolCalls,
  };
}

function emptyChatData(id: string): ChatData {
  const now = Date.now();
  return {
    id,
    title: 'Untitled Chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    llmHistory: [],
    contextTokensUsed: 0,
  };
}

function useSyncedState<T>(initialValue: T) {
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(value);

  const setSyncedValue = useCallback((next: SetStateAction<T>) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (prevState: T) => T)(prev) : next;
      valueRef.current = resolved;
      return resolved;
    });
  }, []);

  return [value, setSyncedValue, valueRef] as const;
}

export function useChats() {
  const chatStorage = useChatStorage();
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesState, setMessagesState, messagesRef] = useSyncedState<Message[]>([]);
  const [llmHistoryState, setLlmHistoryState, llmHistoryRef] = useSyncedState<LlmHistoryMessage[]>([]);
  const [contextTokensUsedState, setContextTokensUsedState, contextTokensUsedRef] = useSyncedState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const activeChatIdRef = useRef<string | null>(null);
  const saveQueueRef = useRef(new OperationQueue());
  const switchQueueRef = useRef(new OperationQueue());
  const isMountedRef = useRef(true);
  const loadVersionRef = useRef(0);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestVersionRef = useRef(0);

  const setMessages = useCallback((next: SetStateAction<Message[]>) => {
    setMessagesState(next);
  }, []);

  const setLlmHistory = useCallback((next: SetStateAction<LlmHistoryMessage[]>) => {
    setLlmHistoryState(next);
  }, []);

  const setContextTokensUsed = useCallback((next: SetStateAction<number>) => {
    setContextTokensUsedState(next);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      loadVersionRef.current += 1;
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const logStorageError = useCallback((action: string, error: unknown) => {
    console.error(`[useChats] ${action} failed`, error);
  }, []);

  const loadChatList = useCallback(async (silent = false): Promise<ChatSession[]> => {
    if (!silent) setIsLoading(true);
    console.log('[useChats] loadChatList: start');
    try {
      if (!chatStorage) {
        console.warn('[useChats] loadChatList: chatStorage is null');
        setChats([]);
        return [];
      }
      const list = await chatStorage.list();
      console.log(`[useChats] loadChatList: success, count = ${list.length}`);
      setChats(list);
      return list;
    } catch (error) {
      logStorageError('load chat list', error);
      setChats([]);
      return [];
    } finally {
      if (!silent) {
        console.log('[useChats] loadChatList: setting isLoading to false');
        setIsLoading(false);
      }
    }
  }, [chatStorage, logStorageError]);

  const loadChat = useCallback(async (chatId: string) => {
    if (!chatStorage) return;
    const loadVersion = ++loadVersionRef.current;
    console.log(`[useChats] loadChat: ${chatId} (v${loadVersion})`);

    try {
      const data = await chatStorage.get(chatId);
      if (!data) {
        console.warn(`[useChats] loadChat: no data for ${chatId}`);
        return;
      }
      if (loadVersion !== loadVersionRef.current) {
        console.warn(`[useChats] loadChat: version mismatch for ${chatId}`);
        return;
      }

      setActiveChatId(data.id);
      activeChatIdRef.current = data.id;
      setMessages(data.messages.map(fromStoredMessage));
      setLlmHistory(data.llmHistory ?? []);
      setContextTokensUsed(data.contextTokensUsed ?? 0);
      setIsTyping(false);
    } catch (error) {
      logStorageError(`load chat ${chatId}`, error);
    }
  }, [chatStorage, logStorageError, setMessages, setLlmHistory, setContextTokensUsed]);

  const saveChatData = useCallback(
    async (
      chatId: string,
      nextMessages: Message[],
      nextLlmHistory: LlmHistoryMessage[],
      nextContextTokensUsed: number,
      titleFallback?: string,
    ) => {
      if (!chatStorage) return;

      try {
        const existing = await chatStorage.get(chatId);
        const now = Date.now();
        const data: ChatData = {
          id: chatId,
          title: titleFallback ?? existing?.title ?? 'Untitled Chat',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          messages: nextMessages.map(toStoredMessage),
          llmHistory: nextLlmHistory,
          contextTokensUsed: nextContextTokensUsed,
        };
        const validatedData = chatDataSchema.parse(data);
        const updatedList = await chatStorage.save(chatId, validatedData);
        setChats(updatedList);
      } catch (error) {
        logStorageError(`save chat ${chatId}`, error);
        throw error;
      }
    },
    [chatStorage, logStorageError],
  );

  const saveCurrentChat = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;
    const requestVersion = ++saveRequestVersionRef.current;

    return saveQueueRef.current.enqueue(async () => {
      if (requestVersion !== saveRequestVersionRef.current) return;
      const snapshotMessages = [...messagesRef.current];
      const snapshotHistory = [...llmHistoryRef.current];
      const snapshotTokens = contextTokensUsedRef.current;
      await saveChatData(chatId, snapshotMessages, snapshotHistory, snapshotTokens);
    });
  }, [saveChatData]);

  const switchChat = useCallback(
    async (chatId: string) => {
      if (activeChatIdRef.current === chatId) return;

      await switchQueueRef.current.enqueue(async () => {
        setIsTyping(false);
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = null;
        }
        await saveCurrentChat();
        await loadChat(chatId);
      });
    },
    [loadChat, saveCurrentChat],
  );

  const newChat = useCallback(async () => {
    await switchQueueRef.current.enqueue(async () => {
      setIsTyping(false);
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      await saveCurrentChat();
      setActiveChatId(null);
      activeChatIdRef.current = null;
      setMessages([]);
      setLlmHistory([]);
      setContextTokensUsed(0);
    });
  }, [saveCurrentChat, setMessages, setLlmHistory, setContextTokensUsed]);

  const createChat = useCallback(async (): Promise<string> => {
    if (!chatStorage) throw new Error('History bridge is unavailable');
    const id = generateChatId();
    try {
      const empty = emptyChatData(id);
      await chatStorage.save(id, empty);
      await loadChatList(true);
      setActiveChatId(id);
      activeChatIdRef.current = id;
      setMessages([]);
      setLlmHistory([]);
      setContextTokensUsed(0);
      return id;
    } catch (error) {
      logStorageError(`create chat ${id}`, error);
      throw error;
    }
  }, [chatStorage, loadChatList, logStorageError, setMessages, setLlmHistory, setContextTokensUsed]);

  const renameChat = useCallback(async (chatId: string, title: string) => {
    if (!chatStorage) return;
    try {
      const data = await chatStorage.get(chatId);
      if (!data) return;
      const nextTitle = title.trim() || 'Untitled Chat';
      const updatedData: ChatData = {
        ...data,
        title: nextTitle,
        updatedAt: Date.now(),
      };
      const updatedList = await chatStorage.save(chatId, updatedData);
      setChats(updatedList);
    } catch (error) {
      logStorageError(`rename chat ${chatId}`, error);
    }
  }, [chatStorage, logStorageError]);

  const deleteChat = useCallback(
    async (chatId: string) => {
      if (!chatStorage) return;
      try {
        const list = await chatStorage.delete(chatId);
        setChats(list);
        if (activeChatIdRef.current !== chatId) return;

        const nextId = list[0]?.id ?? null;
        if (nextId) {
          await loadChat(nextId);
        } else {
          setActiveChatId(null);
          activeChatIdRef.current = null;
          setMessages([]);
          setLlmHistory([]);
          setContextTokensUsed(0);
          setIsTyping(false);
        }
      } catch (error) {
        logStorageError(`delete chat ${chatId}`, error);
      }
    },
    [chatStorage, loadChat, logStorageError, setMessages, setLlmHistory, setContextTokensUsed],
  );

  const persistChatData = useCallback(
    async (
      chatId: string,
      nextMessages: Message[],
      nextLlmHistory: LlmHistoryMessage[],
      nextContextTokensUsed: number,
      titleFallback?: string,
    ) => {
      const requestVersion = ++saveRequestVersionRef.current;
      await saveQueueRef.current.enqueue(async () => {
        if (requestVersion !== saveRequestVersionRef.current) return;
        await saveChatData(chatId, nextMessages, nextLlmHistory, nextContextTokensUsed, titleFallback);
      });
    },
    [saveChatData],
  );

  useEffect(() => {
    async function bootstrap() {
      console.log('[useChats] bootstrap: start');
      const list = await loadChatList();
      if (list.length > 0 && isMountedRef.current) {
        await loadChat(list[0].id);
      }
      console.log('[useChats] bootstrap: done');
    }
    void bootstrap();
  }, [loadChat, loadChatList]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      void saveCurrentChat();
    }, 5000);
  }, [saveCurrentChat]);

  return {
    chats,
    isLoading,
    activeChatId,
    activeChatIdRef,
    messages: messagesState,
    setMessages,
    llmHistory: llmHistoryState,
    setLlmHistory,
    contextTokensUsed: contextTokensUsedState,
    setContextTokensUsed,
    messagesRef,
    llmHistoryRef,
    contextTokensUsedRef,
    isTyping,
    setIsTyping,
    loadChat,
    switchChat,
    newChat,
    createChat,
    renameChat,
    deleteChat,
    persistChatData,
    scheduleAutoSave,
  };
}
