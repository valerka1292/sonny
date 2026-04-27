import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Cpu, Check, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ToolCall } from '../types';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolCallCard } from './ToolCallCard';
import { getToolRenderer } from './toolRenderers/registry';
import { PendingConfirmationContext } from './PendingConfirmationContext';

interface MessageListProps {
  messages: Message[];
  isTyping?: boolean;
  pendingConfirmation?: {
    toolCall: ToolCall;
    output: unknown;
  } | null;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4 rounded-lg border border-border overflow-hidden bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-bg-1/50 border-b border-border">
        <span className="text-xs font-mono text-text-secondary">{language}</span>
        <button
          onClick={handleCopy}
          aria-label="Copy code"
          className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-md p-1 -m-1"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus as never}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '13px',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

export default function MessageList({ messages, isTyping, pendingConfirmation, onApprove, onReject }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const MarkdownComponents = React.useMemo(() => ({
    code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className ?? '');
      const text = String(children ?? '').replace(/\n$/, '');
      return !inline && match ? (
        <CodeBlock language={match[1]}>{text}</CodeBlock>
      ) : (
        <code
          className={`${className} bg-bg-2 px-1.5 py-0.5 rounded-md border border-border/50 text-[13px] text-text-primary`}
          {...props}
        >
          {children}
        </code>
      );
    },
  }), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (messages.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full"
      >
        <div className="w-12 h-12 rounded-full bg-bg-2 border border-border flex items-center justify-center mb-4">
          <Cpu size={24} className="text-text-secondary" />
        </div>
        <h1 className="text-2xl font-semibold mb-2 text-text-primary">How can I assist you today?</h1>
        <p className="text-text-secondary max-w-md text-sm leading-relaxed">
          Start a conversation or switch to an autonomous mode to let me work independently.
        </p>
      </motion.div>
    );
  }

  const renderToolCall = (tc: ToolCall) => {
    const Renderer = getToolRenderer(tc.function?.name);
    if (Renderer) return <Renderer key={tc.index} toolCall={tc} />;

    return <ToolCallCard key={tc.index} toolCall={tc} />;
  };

  const noopApprove = React.useCallback(() => {}, []);
  const noopReject = React.useCallback(() => {}, []);
  const ctxValue = React.useMemo(
    () => ({
      pendingConfirmation: pendingConfirmation ?? null,
      onApprove: onApprove ?? noopApprove,
      onReject: onReject ?? noopReject,
    }),
    [pendingConfirmation, onApprove, onReject, noopApprove, noopReject],
  );

  return (
    <PendingConfirmationContext.Provider value={ctxValue}>
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[768px] mx-auto px-4 py-8 flex flex-col gap-6">
        {messages.map((msg, idx) => {
          const isNew = idx >= messages.length - 2;
          return (
            <motion.div
              key={msg.id}
              initial={isNew ? { opacity: 0, y: 5 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col gap-2 items-start"
            >
              {msg.role === 'assistant' ? (
                <div className="flex gap-3 w-full items-start">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-bg-2 to-bg-3 border border-border flex items-center justify-center shrink-0 mt-0.5">
                    <Cpu size={14} className="text-text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 markdown-body text-[15px] leading-relaxed text-text-primary">
                    {msg.thinking && (
                      <ReasoningBlock
                        content={msg.thinking}
                        isStreaming={isTyping && idx === messages.length - 1 && msg.role === 'assistant'}
                      />
                    )}
                    {msg.toolCalls?.map(renderToolCall)}
                    <ReactMarkdown components={MarkdownComponents}>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="max-w-lg bg-bg-2 px-4 py-2.5 rounded-[18px] text-[15px] leading-relaxed text-text-primary self-end border border-border whitespace-pre-wrap">
                  {msg.content}
                </div>
              )}
            </motion.div>
          );
        })}

        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 items-start"
          >
            <div className="flex gap-3 w-full items-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-bg-2 to-bg-3 border border-border flex items-center justify-center shrink-0 mt-0.5">
                <Cpu size={14} className="text-text-primary" />
              </div>
              <div className="flex-1 min-w-0 pt-2 flex items-center gap-1.5 opacity-60">
                <div className="w-1.5 h-1.5 bg-text-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-text-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-text-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} className="h-px w-full" />
      </div>
    </div>
    </PendingConfirmationContext.Provider>
  );
}
