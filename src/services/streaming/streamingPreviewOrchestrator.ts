import type { DiffFile, ToolCallStreamingPreview } from '../../types';
import { getCachedFileContent } from './oldContentCache';
import { computeDiffHunks } from './incrementalDiff';
import { applyEditPreview } from './editPreview';
import { parsePartialJson } from './partialJson';

export type StreamableDiffSpec =
  | {
      kind: 'write';
      pathField: string;
      contentField: string;
    }
  | {
      kind: 'edit';
      pathField: string;
      oldStringField: string;
      newStringField: string;
      replaceAllField?: string;
    };

/**
 * Per-tool-name registry of how to extract fields from a partial JSON
 * tool-call argument blob to render a live diff preview.
 *
 * - `write`: full-file replacement (Write/WriteFile). Diffs cached old content
 *   against the streamed `content` field.
 * - `edit`: anchored substring replacement (Edit). Applies streamed
 *   `old_string` → `new_string` to the cached old content (single or all
 *   occurrences depending on `replace_all`) before diffing.
 */
export const STREAMABLE_DIFF_TOOLS: Record<string, StreamableDiffSpec> = {
  Write: { kind: 'write', pathField: 'file_path', contentField: 'content' },
  WriteFile: { kind: 'write', pathField: 'file_path', contentField: 'content' },
  Edit: {
    kind: 'edit',
    pathField: 'file_path',
    oldStringField: 'old_string',
    newStringField: 'new_string',
    replaceAllField: 'replace_all',
  },
  EditFile: {
    kind: 'edit',
    pathField: 'file_path',
    oldStringField: 'old_string',
    newStringField: 'new_string',
    replaceAllField: 'replace_all',
  },
};

interface PendingEntry {
  toolName: string;
  rawArgs: string;
}

export type StreamingPreviewDispatch = (toolIndex: number, preview: ToolCallStreamingPreview) => void;

/**
 * Coalesces tool-call argument deltas into rAF-throttled streaming previews.
 *
 * On each delta:
 *  1. Records latest accumulated args for the tool index.
 *  2. Schedules a flush on the next animation frame (no work if one is already
 *     queued — natural batching).
 *  3. On flush, parses partial JSON, extracts argument fields, and — for tools
 *     in STREAMABLE_DIFF_TOOLS — computes a diff against the cached old file
 *     contents.
 *  4. Dispatches a `ToolCallStreamingPreview` per tool index, which the
 *     renderer stores on the tool call so renderers can paint partial state.
 *
 * Versioning ensures stale work never overrides newer dispatches.
 */
export class StreamingPreviewOrchestrator {
  private rafScheduled = false;
  private pending = new Map<number, PendingEntry>();
  private latestVersionPerIndex = new Map<number, number>();
  private rafSchedulerId: number | null = null;

  constructor(private dispatch: StreamingPreviewDispatch) {}

  ingestDelta(toolIndex: number, toolName: string | undefined, accumulatedArgs: string | undefined): void {
    if (toolIndex < 0) return;
    if (!toolName) return;
    if (!accumulatedArgs) return;
    this.pending.set(toolIndex, { toolName, rawArgs: accumulatedArgs });
    this.scheduleFlush();
  }

  flushSync(): void {
    if (this.rafSchedulerId !== null) {
      this.cancelScheduledFlush();
    }
    this.flush();
  }

  dispose(): void {
    this.cancelScheduledFlush();
    this.pending.clear();
  }

  private scheduleFlush(): void {
    if (this.rafScheduled) return;
    this.rafScheduled = true;
    if (typeof requestAnimationFrame === 'function') {
      this.rafSchedulerId = requestAnimationFrame(() => {
        this.rafSchedulerId = null;
        this.flush();
      });
    } else {
      this.rafSchedulerId = setTimeout(() => {
        this.rafSchedulerId = null;
        this.flush();
      }, 16) as unknown as number;
    }
  }

  private cancelScheduledFlush(): void {
    if (this.rafSchedulerId === null) return;
    if (typeof cancelAnimationFrame === 'function') {
      try {
        cancelAnimationFrame(this.rafSchedulerId);
      } catch {
        // ignore
      }
    }
    try {
      clearTimeout(this.rafSchedulerId as unknown as ReturnType<typeof setTimeout>);
    } catch {
      // ignore
    }
    this.rafSchedulerId = null;
    this.rafScheduled = false;
  }

  private flush(): void {
    this.rafScheduled = false;
    if (this.pending.size === 0) return;

    const entries = Array.from(this.pending.entries());
    this.pending.clear();

    for (const [toolIndex, entry] of entries) {
      const version = (this.latestVersionPerIndex.get(toolIndex) ?? 0) + 1;
      this.latestVersionPerIndex.set(toolIndex, version);

      const parsedArgs = parsePartialJson(entry.rawArgs);
      const preview: ToolCallStreamingPreview = {
        parsedArgs,
        diff: this.tryComputeDiff(entry.toolName, parsedArgs),
      };

      this.dispatch(toolIndex, preview);
    }
  }

  private tryComputeDiff(toolName: string, parsedArgs: Record<string, unknown> | undefined): DiffFile | undefined {
    const spec = STREAMABLE_DIFF_TOOLS[toolName];
    if (!spec || !parsedArgs) return undefined;

    const filePath = parsedArgs[spec.pathField];
    if (typeof filePath !== 'string' || filePath.length === 0) return undefined;

    if (spec.kind === 'write') {
      const newContent = parsedArgs[spec.contentField];
      if (typeof newContent !== 'string') return undefined;
      const oldContent = getCachedFileContent(filePath) ?? '';
      try {
        const hunks = computeDiffHunks(oldContent, newContent);
        return { filePath, hunks };
      } catch {
        return { filePath, hunks: [] };
      }
    }

    // kind === 'edit'
    const oldString = parsedArgs[spec.oldStringField];
    const newString = parsedArgs[spec.newStringField];
    if (typeof oldString !== 'string' || typeof newString !== 'string') return undefined;
    // Wait until we have a complete-enough old_string to anchor; partial JSON
    // can hand us a 1-char prefix that would match in many places.
    if (oldString.length === 0) return undefined;

    const oldContent = getCachedFileContent(filePath);
    if (oldContent === undefined) return undefined;

    const replaceAll = spec.replaceAllField !== undefined && parsedArgs[spec.replaceAllField] === true;
    const projected = applyEditPreview(oldContent, oldString, newString, replaceAll);
    if (projected === undefined) return undefined;

    try {
      const hunks = computeDiffHunks(oldContent, projected);
      return { filePath, hunks };
    } catch {
      return { filePath, hunks: [] };
    }
  }
}
