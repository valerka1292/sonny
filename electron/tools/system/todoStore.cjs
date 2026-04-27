const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const todosDir = path.join(os.homedir(), '.sonny', 'todos');

function validateChatId(chatId) {
  if (typeof chatId !== 'string' || !SAFE_ID_PATTERN.test(chatId)) {
    throw new Error(`Invalid chatId: ${String(chatId)}`);
  }
  return chatId;
}

async function ensureDir(dirPath) {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

async function atomicWriteFile(targetPath, content) {
  const tmpPath = `${targetPath}.tmp`;
  try {
    await ensureDir(path.dirname(targetPath));
    await fsPromises.writeFile(tmpPath, content, 'utf-8');
    await fsPromises.rename(tmpPath, targetPath);
  } catch (error) {
    await fsPromises.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function todosPathFor(chatId) {
  validateChatId(chatId);
  return path.join(todosDir, `${chatId}.json`);
}

async function readTodos(chatId) {
  if (!chatId) return [];
  const filePath = todosPathFor(chatId);
  if (!(await pathExists(filePath))) return [];
  try {
    const raw = await fsPromises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.content === 'string' &&
        typeof item.activeForm === 'string' &&
        ['pending', 'in_progress', 'completed'].includes(item.status),
    );
  } catch {
    return [];
  }
}

async function writeTodos(chatId, items) {
  const filePath = todosPathFor(chatId);
  if (items.length === 0) {
    if (await pathExists(filePath)) {
      await fsPromises.unlink(filePath).catch(() => {});
    }
    return [];
  }
  await atomicWriteFile(filePath, JSON.stringify(items, null, 2));
  return items;
}

async function clearTodos(chatId) {
  return writeTodos(chatId, []);
}

module.exports = { readTodos, writeTodos, clearTodos, todosDir };
