import { Loader2 } from 'lucide-react';
import type { DiffFile, ToolRendererProps } from '../../types';

export default function DiffRenderer({ toolCall }: ToolRendererProps) {
  const output = toolCall.result?.output as { diff?: DiffFile } | undefined;
  const diff = output?.diff;
  const status = toolCall.result?.status;

  if (status === 'running') {
    return (
      <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
        <div className="px-3 py-2 text-xs font-semibold text-text-secondary bg-bg-3/30 border-b border-border">
          {toolCall.function?.name}: {toolCall.function?.arguments ? 'Writing file' : 'Running'}
        </div>
        <div className="px-3 py-3 text-xs text-text-secondary flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" />
          Generating diff...
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
        <div className="px-3 py-2 text-xs font-semibold text-text-secondary bg-bg-3/30 border-b border-border">
          {toolCall.function?.name || 'Write'}
        </div>
        <div className="px-3 py-3 text-xs text-text-secondary">Generating diff...</div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="px-3 py-2 text-xs font-semibold text-text-secondary bg-bg-3/30 border-b border-border">
        {toolCall.function?.name}: {diff.filePath}
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

                    {/* Обычный текст, цвет как базовый в VS Code (светло-серый) */}
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
    </div>
  );
}