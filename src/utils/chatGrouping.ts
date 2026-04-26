import type { ChatSession } from '../types';

const MS_PER_DAY = 86_400_000;

export interface ChatGroups {
  today: ChatSession[];
  yesterday: ChatSession[];
  week: ChatSession[];
  older: ChatSession[];
}

export function groupChatsByDate(chats: ChatSession[]): ChatGroups {
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const yesterday = new Date(today.getTime() - MS_PER_DAY);
  const weekAgo = new Date(today.getTime() - 7 * MS_PER_DAY);

  return {
    today: chats.filter((chat) => new Date(chat.updatedAt) >= today),
    yesterday: chats.filter((chat) => {
      const date = new Date(chat.updatedAt);
      return date >= yesterday && date < today;
    }),
    week: chats.filter((chat) => {
      const date = new Date(chat.updatedAt);
      return date >= weekAgo && date < yesterday;
    }),
    older: chats.filter((chat) => new Date(chat.updatedAt) < weekAgo),
  };
}
