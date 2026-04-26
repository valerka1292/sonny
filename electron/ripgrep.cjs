const { spawn } = require('child_process');
const { rgPath } = require('@vscode/ripgrep');

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 20_000_000; // 20 MB

/**
 * Выполняет поиск ripgrep и возвращает массив строк результата.
 * @param {string[]} args - аргументы для rg (без пути)
 * @param {string} cwd - рабочая директория поиска
 * @param {AbortSignal} [signal]
 * @returns {Promise<string[]>}
 */
async function ripGrep(args, cwd, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(rgPath, [...args, '.'], {
      cwd,
      signal,
      windowsHide: true,
      timeout: DEFAULT_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;

    child.stdout.on('data', (data) => {
      if (!truncated) {
        stdout += data.toString();
        if (stdout.length > MAX_BUFFER) {
          stdout = stdout.slice(0, MAX_BUFFER);
          truncated = true;
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        // 0 = matches found, 1 = no matches
        const lines = stdout.trim().split('\n').filter(Boolean);
        resolve(lines);
      } else {
        reject(new Error(`ripgrep exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

module.exports = { ripGrep, rgPath };
