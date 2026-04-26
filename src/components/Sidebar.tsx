import React from 'react';
import { MessageSquare, Plus, Settings, Trash2 } from 'lucide-react';
import { ChatSession } from '../types';
import { cn } from '../lib/utils';
import { groupChatsByDate } from '../utils/chatGrouping';

interface SidebarProps {
  activeChatId: string;
  chats: ChatSession[];
  isLoading: boolean;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onSettingsOpen: () => void;
}

export default function Sidebar({
  activeChatId,
  chats,
  isLoading,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onSettingsOpen,
}: SidebarProps) {
  const groupedChats = React.useMemo(() => groupChatsByDate(chats), [chats]);

  const renderChatGroup = (title: string, groupChats: ChatSession[]) => {
    if (groupChats.length === 0) {
      return null;
    }

    return (
      <div className="mb-2">
        <div className="first:pt-0 px-3 pb-2 pt-4 text-xs font-medium text-text-secondary">{title}</div>
        {groupChats.map((chat) => (
          <div
            key={chat.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectChat(chat.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectChat(chat.id);
              }
            }}
            className={cn(
              'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-white/20',
              activeChatId === chat.id
                ? 'bg-bg-3 text-text-primary'
                : 'text-text-secondary hover:bg-bg-2 hover:text-text-primary',
            )}
          >
            <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate">{chat.title}</span>

            <div className="relative z-10 ml-auto hidden items-center gap-0.5 group-hover:flex">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                className="rounded p-1.5 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                aria-label="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside className="flex h-full w-[260px] flex-shrink-0 flex-col border-r border-border bg-bg-1">
      <div className="titlebar-drag flex h-11 flex-shrink-0 items-center border-b border-border px-4">
        <span className="text-[13px] font-medium text-text-secondary">Agent Workspace</span>
      </div>

      <div className="flex-shrink-0 border-b border-border p-3">
        <button
          onClick={onNewChat}
          className="no-drag w-full rounded-lg border border-border bg-bg-2 px-3 py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-bg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <span className="flex items-center gap-2.5">
            <Plus size={16} strokeWidth={2} />
            New chat
          </span>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-4">
        {isLoading ? (
          <div className="px-3 py-8 text-center text-sm text-text-secondary">Loading chats...</div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center text-text-secondary">
            <MessageSquare size={20} className="opacity-50" />
            <p className="text-sm">No chats yet</p>
            <p className="text-xs opacity-70">Click “New chat” to get started.</p>
          </div>
        ) : (
          <>
            {renderChatGroup('Today', groupedChats.today)}
            {renderChatGroup('Yesterday', groupedChats.yesterday)}
            {renderChatGroup('Previous 7 Days', groupedChats.week)}
            {renderChatGroup('Older', groupedChats.older)}
          </>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-col gap-1 border-t border-border p-3">
        <button
          onClick={onSettingsOpen}
          className="no-drag w-full rounded-lg px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <span className="flex items-center gap-3">
            <Settings size={16} className="text-text-secondary" />
            Settings
          </span>
        </button>
        <div className="px-3 pb-1 pt-1 text-[10px] text-text-secondary">v0.0.1</div>
      </div>
    </aside>
  );
}
