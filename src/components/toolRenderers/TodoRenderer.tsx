import { CheckCircle2, Circle, Loader2, ListTodo, XCircle } from 'lucide-react';
import { ToolRendererProps, TodoItem, TodoStatus } from '../../types';
import { parseToolArguments } from './shared';

interface TodoOutput {
  oldTodos?: TodoItem[];
  newTodos?: TodoItem[];
  cleared?: boolean;
}

function statusIcon(status: TodoStatus) {
  if (status === 'completed') return <CheckCircle2 size={12} className="text-green-500" />;
  if (status === 'in_progress') return <Loader2 size={12} className="animate-spin text-accent" />;
  return <Circle size={12} className="text-text-secondary" />;
}

function headerIcon(status: 'streaming' | 'running' | 'success' | 'error' | 'idle') {
  if (status === 'streaming' || status === 'running') return <Loader2 size={12} className="animate-spin text-accent" />;
  if (status === 'success') return <CheckCircle2 size={12} className="text-green-500" />;
  if (status === 'error') return <XCircle size={12} className="text-red-500" />;
  return <ListTodo size={12} />;
}

export default function TodoRenderer({ toolCall }: ToolRendererProps) {
  const args = parseToolArguments(toolCall);
  const argTodos = (args.todos as TodoItem[] | undefined) ?? [];
  const result = toolCall.result;
  const status = result?.status;
  const output = result?.output as TodoOutput | undefined;
  const isStreaming = !result && Boolean(toolCall.function?.arguments);
  const visualStatus = status ?? (isStreaming ? 'streaming' : 'idle');

  const todosToShow = output?.newTodos ?? argTodos;
  const cleared = output?.cleared === true;

  const verb =
    visualStatus === 'streaming' || visualStatus === 'running'
      ? 'Updating todo list'
      : cleared
        ? 'Cleared todo list'
        : 'Updated todo list';

  return (
    <div className="my-2 max-w-full overflow-hidden rounded-lg border border-border bg-bg-2">
      <div className="flex items-start gap-2 bg-bg-3/30 px-3 py-2 text-xs text-text-secondary">
        <div className="mt-0.5 flex h-4 w-4 items-center justify-center">{headerIcon(visualStatus)}</div>
        <div className="flex-1 break-words font-mono">
          {verb}
          {todosToShow.length > 0 ? ` · ${todosToShow.length} item${todosToShow.length === 1 ? '' : 's'}` : ''}
        </div>
      </div>

      {todosToShow.length > 0 && !cleared && (
        <ul className="divide-y divide-border/40 border-t border-border bg-bg-1/30 px-3 py-2 text-xs">
          {todosToShow.map((todo, idx) => (
            <li key={idx} className="flex items-start gap-2 py-1.5">
              <span className="mt-0.5 flex h-3 w-3 flex-shrink-0 items-center justify-center">
                {statusIcon(todo.status)}
              </span>
              <span
                className={
                  todo.status === 'completed'
                    ? 'flex-1 text-text-secondary line-through'
                    : todo.status === 'in_progress'
                      ? 'flex-1 text-text-primary'
                      : 'flex-1 text-text-secondary'
                }
              >
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </li>
          ))}
        </ul>
      )}

      {status === 'error' && result?.error && (
        <div className="border-t border-border bg-bg-1/30 px-3 pb-3 pt-2 text-xs text-red-400">
          Error: {result.error}
        </div>
      )}
    </div>
  );
}
