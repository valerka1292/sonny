import { Check, Loader2, X } from 'lucide-react';
import type { DiffFile, ToolRendererProps } from '../../types';
import { usePendingConfirmation } from '../PendingConfirmationContext';
import ConfirmationActions from './ConfirmationActions';

interface DiffOutput {
  diff?: DiffFile;
  applied?: boolean;
  filePath?: string;
}

function getVerb(toolName: string | undefined, finalSuccess: boolean): string {
  switch (toolName) {
    case 'Write':
    case 'WriteFile':
      return finalSuccess ? 'Wrote' : 'Write';
    case 'Edit':
    case 'EditFile':
      return finalSuccess ? 'Edited' : 'Edit';
    default:
      return toolName ?? 'Tool';
  }
}

export default function DiffRenderer({ toolCall }: ToolRendererProps) {
  const output = toolCall.result?.output as DiffOutput | undefined;
  const finalDiff = output?.diff;
  const previewDiff = toolCall.streamingPreview?.diff;
  const status = toolCall.result?.status;
  const error = toolCall.result?.error;
  const diff = finalDiff ?? previewDiff;
  const applied = output?.applied === true;
  const finalSuccess = status === 'success' && applied;
  const isStreaming = !finalDiff && Boolean(previewDiff);

  const ctx = usePendingConfirmation();
  const isPendingConfirm =
    ctx?.pendingConfirmation?.toolCall.id !== undefined &&
    toolCall.id !== undefined &&
    ctx.pendingConfirmation.toolCall.id === toolCall.id;

  const isUserRejected = status === 'error' && typeof error === 'string' && /reject/i.test(error);
  const isToolError = status === 'error' && !isUserRejected;

  const toolName = toolCall.function?.name;
  const verb = getVerb(toolName, finalSuccess);

  if (!diff) {
    // Tool errored / was rejected before producing a diff — surface that
    // explicitly so the card doesn't sit on an infinite "Streaming…" spinner.
    if (isToolError || isUserRejected) {
      return (
        <div
          className={`my-2 rounded-lg border ${isToolError ? 'border-red-900/60' : 'border-border'} bg-bg-2 overflow-hidden max-w-full`}
        >
          <div
            className={`px-3 py-2 text-xs font-semibold ${isToolError ? 'text-red-400' : 'text-text-secondary/60'} bg-bg-3/30 border-b border-border flex items-center gap-2`}
          >
            <span>{verb}</span>
            <X size={12} className={isToolError ? 'text-red-400' : 'text-text-secondary/60'} />
          </div>
          {error && (
            <div className="px-3 py-2 text-xs text-red-400 whitespace-pre-wrap break-words">{error}</div>
          )}
        </div>
      );
    }

    // Tool returned success but produced no diff (rare; defensive). Show a
    // "Wrote/Edited" card without diff content rather than a stuck spinner.
    if (status === 'success') {
      const filePath =
        (toolCall.streamingPreview?.parsedArgs?.file_path as string | undefined) ??
        (output as DiffOutput | undefined)?.filePath ??
        '';
      return (
        <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
          <div className="px-3 py-2 text-xs font-semibold text-text-secondary bg-bg-3/30 border-b border-border flex items-center gap-2">
            <span>{verb}{filePath ? `: ${filePath}` : ''}</span>
            {finalSuccess && <Check size={12} className="text-green-400" />}
          </div>
        </div>
      );
    }

    const argsLen = toolCall.function?.arguments?.length ?? 0;
    return (
      <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
        <div className="px-3 py-2 text-xs font-semibold text-text-secondary bg-bg-3/30 border-b border-border">
          {verb}
          {status === 'running' ? ': Applying' : ''}
        </div>
        <div className="px-3 py-3 text-xs text-text-secondary flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" />
          {status === 'running'
            ? 'Applying…'
            : argsLen > 0
              ? `Streaming arguments (${argsLen} chars)…`
              : 'Waiting for tool call…'}
        </div>
      </div>
    );
  }

  const headerToneClass = isToolError
    ? 'text-red-400'
    : isUserRejected
      ? 'text-text-secondary/60'
      : 'text-text-secondary';

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden max-w-full ${
        isToolError ? 'border-red-900/60' : 'border-border'
      } bg-bg-2`}
    >
      <div
        className={`px-3 py-2 text-xs font-semibold ${headerToneClass} bg-bg-3/30 border-b border-border flex items-center gap-2`}
      >
        <span>
          {verb}: {diff.filePath}
        </span>
        {finalSuccess && <Check size={12} className="text-green-400" />}
        {isUserRejected && <X size={12} className="text-red-400" />}
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-accent">
            <Loader2 size={10} className="animate-spin" />
            streaming
          </span>
        )}
        {status === 'running' && !isStreaming && (
          <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary/70">
            <Loader2 size={10} className="animate-spin" />
            applying
          </span>
        )}
      </div>

      <div className="overflow-x-auto text-[13px] font-mono leading-relaxed">
        {diff.hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx} className="border-b border-border/30 last:border-b-0">
            <div className="bg-[#1a2636] text-[#8fa7b7] px-3 py-1 text-xs whitespace-pre">{hunk.header}</div>

            <div className="bg-bg-2">
              {hunk.lines.map((line, lineIdx) => {
                const isAddition = line.type === 'addition';
                const isDeletion = line.type === 'deletion';

                return (
                  <div
                    key={lineIdx}
                    className={`flex ${
                      isAddition ? 'bg-green-950/40' : isDeletion ? 'bg-red-950/40' : ''
                    } hover:bg-bg-3/50`}
                  >
                    <div className="sticky left-0 z-10 flex-shrink-0 w-20 flex border-r border-border/50 select-none text-text-secondary/60 bg-inherit text-xs">
                      <div className={`w-10 text-right pr-2 py-0.5 ${isAddition ? 'opacity-0' : ''}`}>
                        {line.oldLine ?? ''}
                      </div>
                      <div className={`w-10 text-right pr-2 py-0.5 ${isDeletion ? 'opacity-0' : ''}`}>
                        {line.newLine ?? ''}
                      </div>
                    </div>

                    <div className="sticky left-20 z-10 flex-shrink-0 w-5 text-center py-0.5 select-none bg-inherit text-xs">
                      <span
                        className={
                          isAddition
                            ? 'text-green-400'
                            : isDeletion
                              ? 'text-red-400'
                              : 'text-text-secondary/40'
                        }
                      >
                        {isAddition ? '+' : isDeletion ? '-' : ' '}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 whitespace-pre-wrap break-all py-0.5 pr-3 text-[#d4d4d4]">
                      {line.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isPendingConfirm && ctx && (
        <ConfirmationActions onApprove={ctx.onApprove} onReject={ctx.onReject} />
      )}

      {isUserRejected && (
        <div className="border-t border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {isToolError && (
        <div className="border-t border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300 break-words">
          {error}
        </div>
      )}
    </div>
  );
}
