const { execFile, spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { rgPath: vscodeRgPath } = require('@vscode/ripgrep');

const MAX_BUFFER_SIZE = 20_000_000;
const DEFAULT_TIMEOUT_MS = 20_000;

class RipgrepTimeoutError extends Error {
  constructor(message, partialResults) {
    super(message);
    this.name = 'RipgrepTimeoutError';
    this.partialResults = partialResults;
  }
}

class RipgrepUnavailableError extends Error {
  constructor(message, config, code) {
    super(message);
    this.name = 'RipgrepUnavailableError';
    this.config = config;
    this.code = code;
  }
}

function getRipgrepInstallHint(platform = process.platform) {
  switch (platform) {
    case 'win32':
      return 'Install ripgrep and confirm `rg --version` works in the same terminal. Windows: `winget install BurntSushi.ripgrep.MSVC` or `choco install ripgrep`.';
    case 'darwin':
      return 'Install ripgrep and confirm `rg --version` works in the same terminal. macOS: `brew install ripgrep`.';
    default:
      return 'Install ripgrep and confirm `rg --version` works in the same terminal. Linux: use your distro package manager, for example `apt install ripgrep`.';
  }
}

function resolveRipgrepConfig() {
  // Prefer VSCode bundled ripgrep, fallback to system rg.
  if (vscodeRgPath && existsSync(vscodeRgPath)) {
    return { mode: 'builtin', command: vscodeRgPath, args: [] };
  }
  return { mode: 'system', command: 'rg', args: [] };
}

function wrapRipgrepUnavailableError(error, config = resolveRipgrepConfig(), platform = process.platform) {
  const modeExplanation = config.mode === 'builtin'
    ? 'This install could not locate its packaged ripgrep fallback.'
    : 'A working system ripgrep binary was not found on PATH.';

  const originalMessage = error?.message ? ` Original error: ${error.message}` : '';

  return new RipgrepUnavailableError(
    `ripgrep (rg) is required for file search but could not be started. ${modeExplanation} ${getRipgrepInstallHint(platform)}${originalMessage}`,
    { mode: config.mode, command: config.command },
    error?.code,
  );
}

function isEagainError(stderr) {
  return stderr.includes('os error 11') || stderr.includes('Resource temporarily unavailable');
}

function ripGrepRaw(args, target, cwd, abortSignal, callback, singleThread = false) {
  const config = resolveRipgrepConfig();
  const threadArgs = singleThread ? ['-j', '1'] : [];
  const fullArgs = [...config.args, ...threadArgs, ...args, target];
  const parsedSeconds = parseInt(process.env.CLAUDE_CODE_GLOB_TIMEOUT_SECONDS || '', 10) || 0;
  const timeout = parsedSeconds > 0 ? parsedSeconds * 1000 : DEFAULT_TIMEOUT_MS;

  return execFile(
    config.command,
    fullArgs,
    {
      cwd,
      maxBuffer: MAX_BUFFER_SIZE,
      signal: abortSignal,
      timeout,
      killSignal: process.platform === 'win32' ? undefined : 'SIGKILL',
      windowsHide: true,
    },
    callback,
  );
}

async function ripGrepStream(args, target, cwd, abortSignal, onLines) {
  const config = resolveRipgrepConfig();
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, [...config.args, ...args, target], {
      cwd,
      signal: abortSignal,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const stripCR = (line) => (line.endsWith('\r') ? line.slice(0, -1) : line);
    let remainder = '';

    child.stdout?.on('data', (chunk) => {
      const data = remainder + chunk.toString();
      const lines = data.split('\n');
      remainder = lines.pop() ?? '';
      if (lines.length) onLines(lines.map(stripCR));
    });

    let settled = false;
    child.on('close', (code) => {
      if (settled) return;
      if (abortSignal?.aborted) return;
      settled = true;
      if (code === 0 || code === 1) {
        if (remainder) onLines([stripCR(remainder)]);
        resolve();
      } else {
        reject(new Error(`ripgrep exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err?.code === 'ENOENT' ? wrapRipgrepUnavailableError(err) : err);
    });
  });
}

async function ripGrep(args, target, abortSignal, options = {}) {
  const cwd = options.cwd || process.cwd();

  return new Promise((resolve, reject) => {
    const handleResult = (error, stdout, stderr, isRetry) => {
      if (!error) {
        resolve(
          stdout.trim().split('\n').map(line => line.replace(/\r$/, '')).filter(Boolean),
        );
        return;
      }

      if (error.code === 1) {
        resolve([]);
        return;
      }

      if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) {
        reject(error.code === 'ENOENT' ? wrapRipgrepUnavailableError(error) : error);
        return;
      }

      if (!isRetry && isEagainError(stderr || '')) {
        ripGrepRaw(args, target, cwd, abortSignal, (retryError, retryStdout, retryStderr) => {
          handleResult(retryError, retryStdout, retryStderr, true);
        }, true);
        return;
      }

      const hasOutput = stdout && stdout.trim().length > 0;
      const isTimeout = error.signal === 'SIGTERM' || error.signal === 'SIGKILL' || error.code === 'ABORT_ERR';
      const isBufferOverflow = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';

      let lines = [];
      if (hasOutput) {
        lines = stdout.trim().split('\n').map(line => line.replace(/\r$/, '')).filter(Boolean);
        if (lines.length > 0 && (isTimeout || isBufferOverflow)) {
          lines = lines.slice(0, -1);
        }
      }

      if (isTimeout && lines.length === 0) {
        reject(new RipgrepTimeoutError(
          'Ripgrep search timed out after 20 seconds. The search may have matched files but did not complete in time. Try searching a more specific path or pattern.',
          lines,
        ));
        return;
      }

      resolve(lines);
    };

    ripGrepRaw(args, target, cwd, abortSignal, (error, stdout, stderr) => {
      handleResult(error, stdout, stderr, false);
    });
  });
}

module.exports = {
  ripGrep,
  ripGrepStream,
  resolveRipgrepConfig,
  wrapRipgrepUnavailableError,
  RipgrepTimeoutError,
  RipgrepUnavailableError,
};
