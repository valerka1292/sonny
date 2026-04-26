import { CheckCircle2, Loader2, Wrench, XCircle } from 'lucide-react';
import { ToolRendererProps } from '../../types';
import { parseToolArguments } from './shared';

interface GrepOutput {
  mode?: 'content' | 'files_with_matches' | 'count';
  filenames?: string[];
  content?: string;
  numMatches?: number;
  appliedLimit?: number;
  appliedOffset?: number;
}

function getStatusIcon(status?: 'running' | 'success' | 'error') {
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-accent" />;
  if (status === 'success') return <CheckCircle2 size={12} className="text-green-500" />;
  if (status === 'error') return <XCircle size={12} className="text-red-500" />;
  return <Wrench size={12} />;
}

export default function GrepRenderer({ toolCall }: ToolRendererProps) {
  const args = parseToolArguments(toolCall);
  const pattern = (args.pattern as string | undefined) ?? '';
  const searchPath = args.path as string | undefined;

  const result = toolCall.result;
  const status = result?.status;
  const output = result?.output as GrepOutput | undefined;

  const headerPrefix = status === 'running' ? 'Searching' : 'Searched';
  const pathPart = searchPath ? `${searchPath} for` : 'for';

  const renderOutput = () => {
    if (!output) return null;

    if (output.mode === 'files_with_matches') {
      const files = output.filenames ?? [];
      return (
        <>
          {files.length === 0 ? (
            <p>No files with matches found.</p>
          ) : (
            <ul className="space-y-0.5">
              {files.map((file, index) => (
                <li key={`${file}-${index}`} className="font-mono break-all">
                  {file}
                </li>
              ))}
            </ul>
          )}
          {output.appliedLimit !== undefined && <p className="mt-1 opacity-70">Limited to {output.appliedLimit} files.</p>}
          {output.appliedOffset !== undefined && <p className="opacity-70">Offset: {output.appliedOffset}.</p>}
        </>
      );
    }

    if (output.mode === 'content') {
      return (
        <>
          <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">{output.content || ''}</pre>
          {output.appliedLimit !== undefined && <p className="mt-1 opacity-70">Limited to {output.appliedLimit} lines.</p>}
          {output.appliedOffset !== undefined && <p className="opacity-70">Offset: {output.appliedOffset}.</p>}
        </>
      );
    }

    if (output.mode === 'count') {
      return (
        <>
          <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">{output.content || ''}</pre>
          <p className="mt-1 opacity-70">Total matches: {output.numMatches ?? 0}</p>
          {output.appliedLimit !== undefined && <p className="opacity-70">Limited to {output.appliedLimit} files.</p>}
          {output.appliedOffset !== undefined && <p className="opacity-70">Offset: {output.appliedOffset}.</p>}
        </>
      );
    }

    return <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">{JSON.stringify(output, null, 2)}</pre>;
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="w-full flex items-start gap-2 px-3 py-2 text-xs text-text-secondary bg-bg-3/30 text-left">
        <div className="flex items-center justify-center w-4 h-4 mt-0.5">{getStatusIcon(status)}</div>
        <div className="font-mono whitespace-pre-wrap break-words flex-1">
          {`▼ grep\n${headerPrefix} ${pathPart} "${pattern}"`}
        </div>
      </div>

      {status === 'success' && output && (
        <div className="px-3 pb-3 pt-2 text-xs text-text-secondary border-t border-border bg-bg-1/30">{renderOutput()}</div>
      )}

      {status === 'error' && result?.error && (
        <div className="px-3 pb-3 pt-2 text-xs text-red-400 border-t border-border bg-bg-1/30">
          Error: {result.error}
        </div>
      )}
    </div>
  );
}
