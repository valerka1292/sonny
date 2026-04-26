const path = require('path');
const fs = require('fs/promises');

function checkPathInSandbox(userPath, cwd) {
  const resolved = path.resolve(cwd, userPath || '.');
  const sandboxRoot = path.resolve(cwd);
  if (!resolved.startsWith(sandboxRoot + path.sep) && resolved !== sandboxRoot) {
    throw new Error(`Access denied: path '${userPath}' is outside the sandbox.`);
  }
  return resolved;
}

async function fileStatSafe(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat;
  } catch {
    return null;
  }
}

function toRelativePath(absPath, cwd) {
  try {
    return path.relative(cwd, absPath) || '.';
  } catch {
    return absPath;
  }
}


async function atomicWriteFile(targetPath, content) {
  const tmpPath = `${targetPath}.tmp`;
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, targetPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function extractGlobBaseDirectory(pattern) {
  const globChars = /[*?[{]/;
  const match = pattern.match(globChars);

  if (!match || match.index === undefined) {
    const dir = path.dirname(pattern);
    const file = path.basename(pattern);
    return { baseDir: dir, relativePattern: file };
  }

  const staticPrefix = pattern.slice(0, match.index);
  const lastSepIndex = Math.max(
    staticPrefix.lastIndexOf('/'),
    staticPrefix.lastIndexOf(path.sep),
  );

  if (lastSepIndex === -1) {
    return { baseDir: '', relativePattern: pattern };
  }

  let baseDir = staticPrefix.slice(0, lastSepIndex);
  const relativePattern = pattern.slice(lastSepIndex + 1);

  if (baseDir === '' && lastSepIndex === 0) {
    baseDir = '/';
  } else if (/^[A-Za-z]:$/.test(baseDir)) {
    baseDir = baseDir + path.sep;
  }

  return { baseDir, relativePattern };
}

module.exports = {
  checkPathInSandbox,
  fileStatSafe,
  toRelativePath,
  extractGlobBaseDirectory,
  atomicWriteFile,
};
