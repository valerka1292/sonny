import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Brain, ChevronDown } from 'lucide-react';

interface ReasoningBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ReasoningBlock({ content, isStreaming = false }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-[0.7rem] font-mono text-text-secondary/50 transition-all duration-150 hover:bg-bg-2 hover:text-text-primary/70"
      >
        <Brain
          size={12}
          className={isStreaming ? 'animate-pulse text-violet-400/60' : 'text-text-secondary/40'}
        />
        <span className="text-xs">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
        <ChevronDown
          size={10}
          className={`opacity-50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words border-l border-violet-500/20 pl-3 font-mono text-[0.75rem] leading-relaxed text-text-secondary/60">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
