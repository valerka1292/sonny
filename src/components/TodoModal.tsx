import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Circle, Loader2, Trash2, X } from 'lucide-react';
import type { TodoItem, TodoStatus } from '../types';
import { clearTodos, getTodos, setTodos } from '../services/todoBridge';

interface TodoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | null;
}

function statusIcon(status: TodoStatus) {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-green-500" />;
  if (status === 'in_progress') return <Loader2 size={14} className="animate-spin text-accent" />;
  return <Circle size={14} className="text-text-secondary" />;
}

function statusLabel(status: TodoStatus) {
  if (status === 'completed') return 'completed';
  if (status === 'in_progress') return 'in progress';
  return 'pending';
}

export default function TodoModal({ open, onOpenChange, chatId }: TodoModalProps) {
  const [todos, setTodosState] = React.useState<TodoItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!chatId) {
      setTodosState([]);
      return;
    }
    setLoading(true);
    try {
      const items = await getTodos(chatId);
      setTodosState(items);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleDelete = async (index: number) => {
    if (!chatId) return;
    const next = todos.filter((_, i) => i !== index);
    const persisted = await setTodos(chatId, next);
    setTodosState(persisted);
  };

  const handleClearAll = async () => {
    if (!chatId) return;
    await clearTodos(chatId);
    setTodosState([]);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-bg-1 shadow-2xl animate-in fade-in-0 zoom-in-95"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-text-primary">Current tasks</Dialog.Title>
            <div className="flex items-center gap-2">
              {todos.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="rounded-md border border-border bg-bg-2 px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-3 hover:text-text-primary"
                >
                  Clear all
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  aria-label="Close"
                  className="rounded p-1 text-text-secondary hover:bg-bg-3 hover:text-text-primary"
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="py-8 text-center text-sm text-text-secondary">Loading…</div>
            ) : !chatId ? (
              <div className="py-8 text-center text-sm text-text-secondary">
                No active chat. Start one to see its task list here.
              </div>
            ) : todos.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-secondary">
                No tasks yet. The agent will add some when it plans a complex request — and they'll appear here in real
                time.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {todos.map((todo, idx) => (
                  <li key={idx} className="group flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                      {statusIcon(todo.status)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          todo.status === 'completed'
                            ? 'truncate text-[13px] text-text-secondary line-through'
                            : 'truncate text-[13px] text-text-primary'
                        }
                      >
                        {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                        {statusLabel(todo.status)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(idx)}
                      aria-label="Remove task"
                      title="Remove task"
                      className="invisible rounded p-1.5 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-400 group-hover:visible"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border bg-bg-2/40 px-4 py-2 text-[11px] text-text-secondary">
            The agent rewrites this list whenever it calls TodoWrite. Removing items here is local — on the next
            request the model picks up the updated list as part of the system prompt.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
