import type { ChatData, ChatSession, ProvidersData, TodoItem } from '../types';

export {};

declare global {
  interface Window {
    electron?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      platform: string;
      providers?: {
        getAll: () => Promise<ProvidersData>;
        save: (data: ProvidersData) => Promise<ProvidersData>;
      };
      tools?: {
        list: () => Promise<unknown[]>;
        execute: (name: string, input: unknown, meta?: { chatId?: string | null }) => Promise<unknown>;
      };
      todos?: {
        get: (chatId: string) => Promise<TodoItem[]>;
        set: (chatId: string, items: TodoItem[]) => Promise<TodoItem[]>;
        clear: (chatId: string) => Promise<TodoItem[]>;
      };
      getSystemPrompt?: (chatId?: string | null) => Promise<string>;
      history?: {
        list: () => Promise<ChatSession[]>;
        get: (chatId: string) => Promise<ChatData | null>;
        save: (chatId: string, data: ChatData) => Promise<ChatSession[]>;
        delete: (chatId: string) => Promise<ChatSession[]>;
        setPinned: (chatId: string, pinned: boolean) => Promise<ChatSession[]>;
      };
    };
  }
}
