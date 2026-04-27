import DiffMatchPatch from 'diff-match-patch';
import type { DiffHunk, DiffLine } from '../../types';

const dmp = new DiffMatchPatch();
const CONTEXT_LINES = 3;

interface LineCharsResult {
  chars1: string;
  chars2: string;
  lineArray: string[];
}

interface DmpInternal {
  diff_linesToChars_(a: string, b: string): LineCharsResult;
  diff_charsToLines_(diffs: Array<[number, string]>, lineArray: string[]): void;
}

function toDiffLines(oldStr: string, newStr: string): DiffLine[] {
  const internal = dmp as unknown as DmpInternal;
  const chars = internal.diff_linesToChars_(oldStr, newStr);
  const diffs = dmp.diff_main(chars.chars1, chars.chars2, false) as Array<[number, string]>;
  internal.diff_charsToLines_(diffs, chars.lineArray);

  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const [operation, text] of diffs) {
    const rawLines = text.split('\n');
    const hasTrailingNewline = text.endsWith('\n');
    const limit = hasTrailingNewline ? rawLines.length - 1 : rawLines.length;

    for (let idx = 0; idx < limit; idx += 1) {
      const content = rawLines[idx];
      if (operation === 0) {
        lines.push({ type: 'context', content, oldLine, newLine });
        oldLine += 1;
        newLine += 1;
      } else if (operation === -1) {
        lines.push({ type: 'deletion', content, oldLine, newLine: null });
        oldLine += 1;
      } else {
        lines.push({ type: 'addition', content, oldLine: null, newLine });
        newLine += 1;
      }
    }
  }

  return lines;
}

function buildHunks(diffLines: DiffLine[]): DiffHunk[] {
  if (diffLines.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let index = 0;

  while (index < diffLines.length) {
    while (index < diffLines.length && diffLines[index].type === 'context') {
      index += 1;
    }
    if (index >= diffLines.length) break;

    const start = Math.max(0, index - CONTEXT_LINES);
    let cursor = index;
    let lastChanged = index;

    while (cursor < diffLines.length) {
      if (diffLines[cursor].type !== 'context') {
        lastChanged = cursor;
      }
      if (cursor - lastChanged > CONTEXT_LINES) break;
      cursor += 1;
    }

    const end = Math.min(diffLines.length, lastChanged + CONTEXT_LINES + 1);
    const lines = diffLines.slice(start, end);
    const oldNumbers = lines.map((line) => line.oldLine).filter((l): l is number => l !== null);
    const newNumbers = lines.map((line) => line.newLine).filter((l): l is number => l !== null);
    const oldStart = oldNumbers.length > 0 ? oldNumbers[0] : 0;
    const newStart = newNumbers.length > 0 ? newNumbers[0] : 0;

    hunks.push({
      header: `@@ -${oldStart},${oldNumbers.length} +${newStart},${newNumbers.length} @@`,
      oldStart,
      oldLines: oldNumbers.length,
      newStart,
      newLines: newNumbers.length,
      lines,
    });

    index = end;
  }

  return hunks;
}

/**
 * Compute hunks between `oldStr` and `newStr` synchronously on the renderer.
 * Used during streaming previews; the authoritative diff is still recomputed
 * in the main process before commit.
 */
export function computeDiffHunks(oldStr: string, newStr: string): DiffHunk[] {
  return buildHunks(toDiffLines(oldStr, newStr));
}
