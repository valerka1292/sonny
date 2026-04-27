const { parentPort } = require('worker_threads');
const diff = require('diff');

function generateDiffHunks(oldStr, newStr) {
  const patch = diff.structuredPatch('', '', oldStr, newStr, '', '', { context: 3 });

  return patch.hunks.map((hunk) => {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    const lines = hunk.lines.map((line) => {
      const prefix = line[0];
      const content = line.slice(1);
      const isAddition = prefix === '+';
      const isDeletion = prefix === '-';

      const result = {
        type: isAddition ? 'addition' : isDeletion ? 'deletion' : 'context',
        content,
        oldLine: isAddition ? null : oldLine,
        newLine: isDeletion ? null : newLine,
      };

      if (!isAddition) oldLine += 1;
      if (!isDeletion) newLine += 1;

      return result;
    });

    return {
      header: hunk.lines.length > 0 ? `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` : '',
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines,
    };
  });
}

if (!parentPort) {
  throw new Error('diffWorker must be run as a worker thread');
}

parentPort.on('message', ({ oldStr, newStr }) => {
  try {
    const hunks = generateDiffHunks(oldStr, newStr);
    parentPort.postMessage({ hunks });
  } catch (error) {
    parentPort.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
