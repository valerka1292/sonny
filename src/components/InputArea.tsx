import React from 'react';
import { Send, ChevronDown, Play, Square } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { AgentMode } from '../types';
import { AGENT_MODES } from '../constants';
import { cn } from '../lib/utils';
import { ContextIndicator } from './ContextIndicator';

interface InputAreaProps {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onSend: (text: string) => void;
  hasProvider: boolean;
  isAgentRunning: boolean;
  onToggleAgent: () => void;
  contextTokensUsed?: number;
  yoloMode: boolean;
  onYoloModeChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export default function InputArea({
  mode,
  onModeChange,
  onSend,
  hasProvider,
  isAgentRunning,
  onToggleAgent,
  contextTokensUsed,
  yoloMode,
  onYoloModeChange,
  disabled = false,
}: InputAreaProps) {
  const [text, setText] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const canSend = Boolean(text.trim()) && hasProvider && !disabled;
  const isModeLocked = true;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mode === 'Chat' && canSend) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [text]);

  const contextUsed = Math.max(0, contextTokensUsed ?? 0);

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bg-0 via-bg-0 to-transparent pb-6 pt-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4">
        <div className="overflow-hidden rounded-xl border border-border bg-bg-1">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <Select.Root
              value={mode}
              onValueChange={(val) => {
                if (!isModeLocked || val === 'Chat') {
                  onModeChange(val as AgentMode);
                }
              }}
            >
              <Select.Trigger
                aria-label="Agent Mode"
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-2 px-3 py-1.5 text-sm font-medium text-text-primary outline-none transition-colors hover:bg-bg-3 focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <span className="text-xs font-normal text-text-secondary">Mode:</span>
                <Select.Value />
                <Select.Icon>
                  <ChevronDown size={14} className="text-text-secondary" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content
                  position="popper"
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="z-50 w-64 animate-in zoom-in-95 overflow-hidden rounded-xl border border-border bg-bg-1 shadow-lg fade-in-0"
                >
                  <Select.Viewport className="py-1">
                    {AGENT_MODES.map((m) => (
                      <Select.Item
                        key={m.id}
                        value={m.id}
                        disabled={isModeLocked && m.id !== 'Chat'}
                        className={cn(
                          'flex select-none flex-col gap-0.5 px-4 py-2 text-[13px] outline-none',
                          isModeLocked && m.id !== 'Chat'
                            ? 'cursor-not-allowed opacity-40'
                            : 'cursor-pointer hover:bg-bg-3 data-[highlighted]:bg-bg-3 data-[state=checked]:bg-bg-3',
                        )}
                      >
                        <Select.ItemText>
                          <span className={`font-medium ${mode === m.id ? 'text-text-primary' : 'text-text-secondary'}`}>{m.label}</span>
                        </Select.ItemText>
                        <span className="block truncate text-[10px] text-text-secondary">{m.description}</span>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={yoloMode}
                onChange={(event) => onYoloModeChange(event.target.checked)}
                className="h-3.5 w-3.5"
              />
              YOLO Mode
            </label>
          </div>

          {mode === 'Chat' ? (
            <div className="flex items-end gap-2 px-4 pb-3">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasProvider ? 'Message agent...' : 'Add a provider in Settings to start'}
                aria-label="Message input"
                disabled={!hasProvider || disabled}
                className="min-h-[52px] max-h-[200px] flex-1 resize-none bg-transparent pt-3 text-[15px] leading-relaxed text-text-primary outline-none placeholder:text-text-secondary scrollbar-thin disabled:opacity-50"
                rows={1}
              />
              <button
                aria-label="Send message"
                onClick={handleSend}
                disabled={!canSend}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-black transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:bg-bg-3 disabled:text-text-secondary disabled:hover:opacity-100 focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Send size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="flex items-center gap-2 text-sm">
                <div className={cn('h-2 w-2 rounded-full transition-colors', isAgentRunning ? 'animate-pulse bg-green-500' : 'bg-bg-3')} />
                <span className="font-medium text-text-secondary">{isAgentRunning ? 'Running...' : 'Idle'}</span>
              </div>

              {!isAgentRunning ? (
                <button
                  onClick={onToggleAgent}
                  className="flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black shadow-sm transition-all hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  <Play size={16} className="fill-current" />
                  Start {mode} Cycle
                </button>
              ) : (
                <button
                  onClick={onToggleAgent}
                  className="flex items-center gap-2 rounded-lg bg-red-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500/50"
                >
                  <Square size={14} className="fill-current" />
                  Stop
                </button>
              )}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-secondary">
            <ContextIndicator usedTokens={contextUsed} />

            <div className="hidden items-center justify-end gap-1.5 text-text-secondary/60 sm:flex">
              <kbd className="rounded border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
              <span>to send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
