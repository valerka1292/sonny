import { CheckCircle2, Loader2, Wrench, XCircle } from 'lucide-react';
import { ToolCall, ToolRendererProps } from '../../types';
import { parseToolArguments } from './shared';

interface GlobOutput {
  filenames?: string[];
  truncated?: boolean;
  durationMs?: number;
  numFiles?: number;
}

function getStatusIcon(status?: 'running' | 'success' | 'error') {
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-accent" />;
  if (status === 'success') return <CheckCircle2 size={12} className="text-green-500" />;
  if (status === 'error') return <XCircle size={12} className="text-red-500" />;
  return <Wrench size={12} />;
}

export default function GlobRenderer({ toolCall }: ToolRendererProps) {
  const args = parseToolArguments(toolCall);
  const pattern = (args.pattern as string | undefined) ?? '';
  const searchPath = args.path as string | undefined;

  const result = toolCall.result;
  const status = result?.status;
  const output = result?.output as GlobOutput | undefined;

  const headerPrefix = status === 'running' ? 'Searching' : 'Searched';
  const pathPart = searchPath ? `${searchPath} for` : 'for';

  const filenames = output?.filenames ?? [];
  const shown = filenames.length;
  const total = output?.numFiles ?? shown;
  const hidden = output?.truncated ? Math.max(total - shown, 0) : 0;

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="w-full flex items-start gap-2 px-3 py-2 text-xs text-text-secondary bg-bg-3/30 text-left">
        <div className="flex items-center justify-center w-4 h-4 mt-0.5">{getStatusIcon(status)}</div>
        <div className="font-mono whitespace-pre-wrap break-words flex-1">
          {`glob\n${headerPrefix} ${pathPart} ${pattern}`}
        </div>
      </div>

      {status === 'success' && output && (
        <div className="px-3 pb-3 pt-2 text-xs text-text-secondary border-t border-border bg-bg-1/30">
          {filenames.length === 0 ? (
            <p>No files found matching the pattern.</p>
          ) : (
            <>
              <ul className="space-y-0.5">
                {filenames.map((file, index) => (
                  <li key={`${file}-${index}`} className="font-mono break-all">
                    {file}
                  </li>
                ))}
              </ul>
              {hidden > 0 && <p className="mt-1 opacity-70">... and {hidden} more files</p>}
            </>
          )}
        </div>
      )}

      {status === 'error' && result?.error && (
        <div className="px-3 pb-3 pt-2 text-xs text-red-400 border-t border-border bg-bg-1/30">
          Error: {result.error}
        </div>
      )}
    </div>
  );
}
