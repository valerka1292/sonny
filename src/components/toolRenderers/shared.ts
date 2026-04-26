import { DiffFile, DiffHunk, ToolCall } from '../../types';

export function parseToolArguments(toolCall: ToolCall): Record<string, unknown> {
  const rawArgs = toolCall.function?.arguments;
  if (!rawArgs) return {};

  try {
    const parsed = JSON.parse(rawArgs);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function buildDiffFile(filePath: string, hunks: DiffHunk[]): DiffFile {
  return { filePath, hunks };
}
