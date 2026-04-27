const path = require('path');
const os = require('os');
const Piscina = require('piscina');

const pool = new Piscina({
  filename: path.join(__dirname, 'diffWorker.cjs'),
  minThreads: 1,
  maxThreads: Math.max(2, Math.min(4, os.cpus().length)),
  idleTimeout: 30_000,
});

async function generateDiffHunks(oldStr, newStr, options = {}) {
  const { signal, timeoutMs = 30000 } = options;

  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Diff generation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const abortPromise =
    signal == null
      ? null
      : new Promise((_, reject) => {
          if (signal.aborted) {
            reject(new Error('Diff generation aborted'));
            return;
          }

          signal.addEventListener('abort', () => reject(new Error('Diff generation aborted')), { once: true });
        });

  try {
    const jobs = [pool.run({ oldStr, newStr }, { signal }), timeoutPromise];
    if (abortPromise) jobs.push(abortPromise);
    return await Promise.race(jobs);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { generateDiffHunks };
