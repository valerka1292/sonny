const path = require('path');
const { Worker } = require('worker_threads');

function generateDiffHunks(oldStr, newStr, options = {}) {
  const { signal, timeoutMs = 30000 } = options;

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'diffWorker.cjs'));
    let settled = false;

    let timeoutId = null;

    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (timeoutId) clearTimeout(timeoutId);
      worker.removeAllListeners();
      worker.terminate().catch(() => {});
    };

    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const rejectOnce = finish(reject);
    const resolveOnce = finish(resolve);

    const onAbort = () => {
      worker.terminate().catch(() => {});
      rejectOnce(new Error('Diff generation aborted'));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    timeoutId = setTimeout(() => {
      worker.terminate().catch(() => {});
      rejectOnce(new Error(`Diff generation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.on('message', (payload) => {
      if (payload && payload.error) {
        rejectOnce(new Error(payload.error));
        return;
      }
      resolveOnce(payload?.hunks || []);
    });

    worker.on('error', (error) => {
      rejectOnce(error);
    });

    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        rejectOnce(new Error(`Diff worker exited with code ${code}`));
      }
    });

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    worker.postMessage({ oldStr, newStr });
  });
}

module.exports = { generateDiffHunks };
