const { app, BrowserWindow, ipcMain } = require('electron');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { z } = require('zod');
const { registry } = require('./tools/registry.cjs');
const { getSystemPrompt } = require('./prompts.cjs');

// Initialize tools
require('./tools/system/GrepTool.cjs');

const isDev = process.env.NODE_ENV === 'development';
const sonnyDir = path.join(os.homedir(), '.sonny');
const providersPath = path.join(sonnyDir, 'providers.json');
const historyDir = path.join(sonnyDir, 'history');
const historyIndexPath = path.join(historyDir, 'index.json');
const sandboxPath = path.join(sonnyDir, 'sandbox');
const promptsDir = path.join(sonnyDir, 'prompts');
const TOOL_EXEC_TIMEOUT_MS = 30000;

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const roleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
const providerSchema = z.object({
  id: z.string().min(1),
  visualName: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string(),
  model: z.string().min(1),
  contextWindowSize: z.number().int().nonnegative(),
});
const providersDataSchema = z.object({
  activeProviderId: z.string().nullable(),
  providers: z.record(z.string(), providerSchema),
});
const toolCallSchema = z.object({
  index: z.number().int(),
  id: z.string().optional(),
  function: z
    .object({
      name: z.string().optional(),
      arguments: z.string().optional(),
    })
    .optional(),
  result: z
    .object({
      status: z.enum(['running', 'success', 'error']),
      error: z.string().optional(),
      output: z.unknown().optional(),
    })
    .optional(),
});
const storedMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number().int(),
  thinking: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional(),
});
const llmHistorySchema = z.object({
  role: roleSchema,
  content: z.string(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.unknown()).optional(),
});
const chatDataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  messages: z.array(storedMessageSchema),
  llmHistory: z.array(llmHistorySchema),
  contextTokensUsed: z.number().nonnegative(),
});
const chatSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updatedAt: z.number().int(),
});

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function validateChatId(chatId) {
  if (typeof chatId !== 'string' || !SAFE_ID_PATTERN.test(chatId)) {
    throw new Error(`Invalid chatId: ${String(chatId)}`);
  }
  return chatId;
}

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

async function copyDefaultPrompts() {
  await ensureDir(promptsDir);
  const files = await fsPromises.readdir(promptsDir);
  if (files.length > 0) return; // Не перезаписываем, если уже есть кастомные промпты

  const srcDir = isDev
    ? path.join(__dirname, '..', 'prompts') 
    : path.join(process.resourcesPath, 'prompts');

  try {
    if (await pathExists(srcDir)) {
      const srcFiles = await fsPromises.readdir(srcDir);
      for (const file of srcFiles) {
        await fsPromises.copyFile(path.join(srcDir, file), path.join(promptsDir, file));
      }
      console.log('[Main] Default prompts copied to', promptsDir);
    }
  } catch (e) {
    console.warn('[Main] Could not copy default prompts:', e.message);
  }
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

async function readProviders() {
  if (!(await pathExists(providersPath))) return { activeProviderId: null, providers: {} };
  try {
    const raw = await fsPromises.readFile(providersPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { 
      activeProviderId: typeof parsed?.activeProviderId === 'string' ? parsed.activeProviderId : null, 
      providers: typeof parsed?.providers === 'object' ? parsed.providers : {} 
    };
  } catch {
    return { activeProviderId: null, providers: {} };
  }
}

async function writeProviders(data) {
  await atomicWriteFile(providersPath, JSON.stringify(data, null, 2));
}

async function readChat(chatId) {
  validateChatId(chatId);
  const filePath = path.join(historyDir, `${chatId}.json`);
  if (!(await pathExists(filePath))) return null;
  try {
    const raw = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeChat(chatId, data) {
  validateChatId(chatId);
  await atomicWriteFile(path.join(historyDir, `${chatId}.json`), JSON.stringify(data, null, 2));
}

async function listChats() {
  await ensureDir(historyDir);
  const rawIndex = await pathExists(historyIndexPath) ? await fsPromises.readFile(historyIndexPath, 'utf-8') : '[]';
  try {
    return JSON.parse(rawIndex).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function registerIpc() {
  // Tools
  ipcMain.handle('tool:list', async () => registry.list());
  ipcMain.handle('tool:execute', async (event, { name, input }) => {
    const tool = registry.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    await ensureDir(sandboxPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Tool ${name} timed out`)), TOOL_EXEC_TIMEOUT_MS);
    const context = { cwd: sandboxPath, signal: controller.signal, timeoutMs: TOOL_EXEC_TIMEOUT_MS };
    const parsed = tool.inputSchema.parse(input);
    try {
      return await withTimeout(tool.execute(parsed, context), TOOL_EXEC_TIMEOUT_MS, `Tool ${name}`);
    } finally {
      clearTimeout(timeout);
    }
  });

  // Prompts
  ipcMain.handle('get-system-prompt', async () => {
    return getSystemPrompt(sandboxPath, promptsDir);
  });

  // Providers & History
  ipcMain.handle('providers:getAll', async () => readProviders());
  ipcMain.handle('providers:save', async (_, data) => {
    const validated = providersDataSchema.parse(data);
    await writeProviders(validated);
    return readProviders();
  });
  ipcMain.handle('history:list', async () => listChats());
  ipcMain.handle('history:get', async (_, chatId) => readChat(chatId));
  ipcMain.handle('history:save', async (_, chatId, data) => {
    const validatedChat = chatDataSchema.parse(data);
    await writeChat(chatId, validatedChat);
    const list = await listChats();
    const updated = chatSessionSchema.array().parse([
      ...list.filter((c) => c.id !== chatId),
      { id: chatId, title: validatedChat.title, updatedAt: Date.now() },
    ]);
    await atomicWriteFile(historyIndexPath, JSON.stringify(updated));
    return updated;
  });
  ipcMain.handle('history:delete', async (_, chatId) => {
    validateChatId(chatId);
    const filePath = path.join(historyDir, `${chatId}.json`);
    if (await pathExists(filePath)) await fsPromises.unlink(filePath);
    const list = (await listChats()).filter(c => c.id !== chatId);
    await atomicWriteFile(historyIndexPath, JSON.stringify(list));
    return list;
  });

  // Window Controls
  ipcMain.on('minimize-window', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('maximize-window', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
  });
  ipcMain.on('close-window', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, frame: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });
  if (isDev) win.loadURL('http://localhost:3000');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(async () => {
  await ensureDir(sandboxPath);
  await copyDefaultPrompts();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
