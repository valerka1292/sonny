import React from 'react';
import { Wrench, Loader2, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { ToolCall } from '../types';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = React.useState(false);
  const result = toolCall.result;
  const isRunning = result?.status === 'running';
  const isSuccess = result?.status === 'success';
  const isError = result?.status === 'error';

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-3 transition-colors text-left"
      >
        <div className="flex items-center justify-center w-4 h-4">
          {isRunning ? <Loader2 size={12} className="animate-spin text-accent" /> :
           isSuccess ? <CheckCircle2 size={12} className="text-green-500" /> :
           isError ? <XCircle size={12} className="text-red-500" /> :
           <Wrench size={12} />}
        </div>
        <span className="font-mono font-semibold truncate flex-1">
          {toolCall.function?.name || 'Unknown Tool'}
        </span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      
      {expanded && (
        <div className="px-3 pb-3 text-[11px] text-text-secondary border-t border-border bg-bg-1/30">
          <div className="pt-2">
            <span className="font-semibold opacity-70 uppercase tracking-wider">Arguments:</span>
            <pre className="mt-1 whitespace-pre-wrap break-all bg-bg-0 p-2 rounded border border-border/50 font-mono">
              {toolCall.function?.arguments || '{}'}
            </pre>
          </div>
          
          {result?.output && (
            <div className="mt-2">
              <span className="font-semibold opacity-70 uppercase tracking-wider">Output:</span>
              <pre className="mt-1 whitespace-pre-wrap break-all bg-bg-0 p-2 rounded border border-border/50 max-h-40 overflow-auto font-mono text-[10px]">
                {typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}
              </pre>
            </div>
          )}
          
          {result?.error && (
            <div className="mt-2 text-red-400">
              <span className="font-semibold uppercase tracking-wider">Error:</span>
              <p className="mt-1 bg-red-900/10 p-2 rounded border border-red-500/20">
                {result.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
