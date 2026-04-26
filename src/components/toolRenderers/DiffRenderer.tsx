import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { DiffFile, ToolRendererProps } from '../../types';

function getLanguage(filePath: string): string {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.css')) return 'css';
  if (filePath.endsWith('.md')) return 'markdown';
  return 'text';
}

export default function DiffRenderer({ toolCall }: ToolRendererProps) {
  const output = toolCall.result?.output as { diff?: DiffFile } | undefined;
  const diff = output?.diff;

  if (!diff) {
    return <div className="text-xs text-red-400">No diff data</div>;
  }

  const language = diff.language || getLanguage(diff.filePath);

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="px-3 py-2 text-xs font-semibold text-text-secondary bg-bg-3/30 border-b border-border">
        {toolCall.function?.name}: {diff.filePath}
      </div>

      <div className="overflow-x-auto text-xs font-mono leading-5">
        {diff.hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx} className="border-b border-border/30 last:border-b-0">
            <div className="bg-[#1a2636] text-[#8fa7b7] px-3 py-1 whitespace-pre">{hunk.header}</div>

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
                    <div className="sticky left-0 z-10 flex-shrink-0 w-20 flex border-r border-border/50 select-none text-text-secondary/60 bg-inherit">
                      <div className={`w-10 text-right pr-2 py-0.5 ${isAddition ? 'opacity-0' : ''}`}>
                        {line.oldLine ?? ''}
                      </div>
                      <div className={`w-10 text-right pr-2 py-0.5 ${isDeletion ? 'opacity-0' : ''}`}>
                        {line.newLine ?? ''}
                      </div>
                    </div>

                    <div className="sticky left-20 z-10 flex-shrink-0 w-5 text-center py-0.5 select-none bg-inherit">
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

                    <div className="flex-1 min-w-0 whitespace-pre-wrap break-all py-0.5 pr-3">
                      <SyntaxHighlighter
                        language={language}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          padding: 0,
                          background: 'transparent',
                          fontSize: 'inherit',
                          display: 'inline',
                        }}
                        codeTagProps={{ style: { background: 'transparent' } }}
                      >
                        {line.content}
                      </SyntaxHighlighter>
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
