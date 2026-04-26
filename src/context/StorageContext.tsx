import React, { createContext, useContext, useMemo } from 'react';
import type { ChatData, ChatSession, ProvidersData } from '../types';

export interface ChatStorage {
  list: () => Promise<ChatSession[]>;
  get: (chatId: string) => Promise<ChatData | null>;
  save: (chatId: string, data: ChatData) => Promise<ChatSession[]>;
  delete: (chatId: string) => Promise<ChatSession[]>;
}

export interface ProviderStorage {
  getAll: () => Promise<ProvidersData>;
  save: (data: ProvidersData) => Promise<ProvidersData>;
}

interface StorageContextValue {
  chatStorage: ChatStorage | null;
  providerStorage: ProviderStorage | null;
}

const StorageContext = createContext<StorageContextValue>({
  chatStorage: null,
  providerStorage: null,
});

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<StorageContextValue>(() => {
    const electron = window.electron;
    return {
      chatStorage: electron?.history ?? null,
      providerStorage: electron?.providers ?? null,
    };
  }, []);

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useChatStorage() {
  const context = useContext(StorageContext);
  return context.chatStorage;
}

export function useProviderStorage() {
  const context = useContext(StorageContext);
  return context.providerStorage;
}
