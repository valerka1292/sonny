import { DiffFile, DiffHunk, ToolCall } from '../../types';
import { parsePartialJson } from '../../services/streaming/partialJson';

/**
 * Returns the current best-effort view of the tool-call arguments.
 *
 * Prefers the orchestrator-supplied `streamingPreview.parsedArgs` (already
 * partial-JSON parsed and rAF-batched) so renderers can paint live state
 * while the LLM is still streaming. Falls back to a partial parse of the raw
 * arguments string for the case where the orchestrator hasn't run yet (e.g.
 * the renderer is reading a freshly-deserialized chat from disk).
 */
export function parseToolArguments(toolCall: ToolCall): Record<string, unknown> {
  const fromPreview = toolCall.streamingPreview?.parsedArgs;
  if (fromPreview) return fromPreview;

  const fromRaw = parsePartialJson(toolCall.function?.arguments);
  return fromRaw ?? {};
}

export function buildDiffFile(filePath: string, hunks: DiffHunk[]): DiffFile {
  return { filePath, hunks };
}
