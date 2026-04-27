import { CheckCircle2, Loader2, Wrench, XCircle } from 'lucide-react';
import { ToolRendererProps } from '../../types';
import { parseToolArguments } from './shared';

interface ReadOutput {
  filePath?: string;
  numLines?: number;
  startLine?: number;
  totalLines?: number;
  content?: string;
}

function getStatusIcon(status: 'streaming' | 'running' | 'success' | 'error' | 'idle') {
  if (status === 'streaming' || status === 'running') return <Loader2 size={12} className="animate-spin text-accent" />;
  if (status === 'success') return <CheckCircle2 size={12} className="text-green-500" />;
  if (status === 'error') return <XCircle size={12} className="text-red-500" />;
  return <Wrench size={12} />;
}

export default function ReadRenderer({ toolCall }: ToolRendererProps) {
  const args = parseToolArguments(toolCall);
  const filePath = (args.file_path as string) ?? '';
  const result = toolCall.result;
  const status = result?.status;
  const output = result?.output as ReadOutput | undefined;
  const isStreaming = !result && Boolean(toolCall.function?.arguments);
  const visualStatus = status ?? (isStreaming ? 'streaming' : 'idle');
  const verb = visualStatus === 'streaming' ? 'Reading' : visualStatus === 'running' ? 'Reading' : 'Read';

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="flex items-start gap-2 px-3 py-2 text-xs text-text-secondary bg-bg-3/30">
        <div className="flex items-center justify-center w-4 h-4 mt-0.5">{getStatusIcon(visualStatus)}</div>
        <div className="font-mono whitespace-pre-wrap break-words flex-1">{verb} {filePath || '…'}</div>
      </div>

      {status === 'success' && output && (
        <div className="px-3 pb-3 pt-2 text-xs text-text-secondary border-t border-border bg-bg-1/30">
          <p>
            Read <strong>{output.numLines ?? 0}</strong> lines
            {output.startLine !== undefined ? ` (starting at line ${output.startLine})` : ''} of{' '}
            <strong>{output.totalLines ?? 0}</strong> total.
          </p>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] max-h-40 overflow-auto border border-border/50 rounded p-1 bg-bg-0">
            {output.content ?? ''}
          </pre>
        </div>
      )}

      {status === 'error' && result?.error && (
        <div className="px-3 pb-3 pt-2 text-xs text-red-400 border-t border-border bg-bg-1/30">Error: {result.error}</div>
      )}
    </div>
  );
}
