import type { ChatData, ChatSession, ProvidersData } from '../types';

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
