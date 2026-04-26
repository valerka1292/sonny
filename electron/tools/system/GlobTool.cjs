// electron/tools/system/GlobTool.cjs
const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const path = require('path');
const fs = require('fs/promises');
const { ripGrep } = require('../../ripgrep.cjs');

// ─── Константы ────────────────────────────────────────────────
const MAX_RESULTS = 100;                  // лимит по умолчанию
const VCS_DIRECTORIES = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];

// ─── Вспомогательные функции ──────────────────────────────────

/**
 * Извлекает статическую базовую директорию из glob-паттерна.
 * Возвращает { baseDir, relativePattern }, где baseDir – директория для поиска,
 * relativePattern – оставшаяся часть паттерна, которую передадим в --glob.
 */
function extractGlobBaseDirectory(pattern) {
  const globChars = /[*?[{]/;
  const match = pattern.match(globChars);

  if (!match || match.index === undefined) {
    // Нет glob-символов – это литеральный путь
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
    // Нет разделителя до glob – паттерн целиком относителен
    return { baseDir: '', relativePattern: pattern };
  }

  let baseDir = staticPrefix.slice(0, lastSepIndex);
  const relativePattern = pattern.slice(lastSepIndex + 1);

  // Корневой паттерн (Unix: "/*.txt", Windows: "C:/*.txt" и т.д.)
  if (baseDir === '' && lastSepIndex === 0) {
    baseDir = '/';
  } else if (/^[A-Za-z]:$/.test(baseDir)) {
    // Windows drive root: 'C:' → 'C:\'
    baseDir = baseDir + path.sep;
  }

  return { baseDir, relativePattern };
}

/**
 * Получает stat файла, игнорируя ошибки (возвращает null при недоступности).
 */
async function fileStatSafe(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat;
  } catch {
    return null;
  }
}

/**
 * Преобразует абсолютный путь в относительный от заданной рабочей директории.
 */
function toRelativePath(absPath, cwd) {
  try {
    return path.relative(cwd, absPath) || '.';
  } catch {
    return absPath;
  }
}

// ─── Инструмент ───────────────────────────────────────────────

class GlobTool extends Tool {
  constructor() {
    super();
    this.name = 'Glob';
    this.description = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`;
    this.ro = true;
    this.rw = false;

    this.inputSchema = z.object({
      pattern: z.string().describe('The glob pattern to match files against'),
      path: z
        .string()
        .optional()
        .describe(
          'The directory to search in. If not specified, the current working directory will be used. ' +
          'IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" — simply omit it for the default behavior. ' +
          'Must be a valid directory path if provided.',
        ),
      head_limit: z
        .number()
        .int()
        .optional()
        .describe('Maximum number of files to return. Defaults to 100. Pass 0 for unlimited.'),
      offset: z
        .number()
        .int()
        .optional()
        .default(0)
        .describe('Number of files to skip before applying the limit.'),
    });

    this.outputSchema = z.object({
      filenames: z.array(z.string()),
      numFiles: z.number(),
      truncated: z.boolean(),
      durationMs: z.number().optional(),
    });
  }

  /**
   * Проверяет, что путь находится внутри песочницы (аналогично GrepTool).
   */
  checkPathInSandbox(userPath, cwd) {
    const resolved = path.resolve(cwd, userPath || '.');
    const sandboxRoot = path.resolve(cwd);
    if (!resolved.startsWith(sandboxRoot + path.sep) && resolved !== sandboxRoot) {
      throw new Error(`Access denied: path '${userPath}' is outside the sandbox.`);
    }
    return resolved;
  }

  async execute(input, context) {
    const start = Date.now();
    const { cwd: sandboxRoot, signal } = context;

    // 1️⃣ Определяем рабочую директорию и паттерн
    let searchDir = sandboxRoot;
    let searchPattern = input.pattern;

    if (path.isAbsolute(input.pattern)) {
      const { baseDir, relativePattern } = extractGlobBaseDirectory(input.pattern);
      if (baseDir) {
        // Проверяем baseDir на принадлежность к песочнице
        this.checkPathInSandbox(baseDir, sandboxRoot);
        searchDir = baseDir;
        searchPattern = relativePattern;
      }
    }

    // Если явно передан path, используем его (и он тоже проверяется)
    if (input.path) {
      const userPath = input.path;
      // checkPathInSandbox разрешает только относительные/абсолютные пути внутри песочницы
      this.checkPathInSandbox(userPath, sandboxRoot);
      searchDir = path.resolve(sandboxRoot, userPath);
    }

    // 2️⃣ Параметры лимита
    const limit = input.head_limit ?? MAX_RESULTS;
    const offset = input.offset ?? 0;

    // 3️⃣ Строим аргументы для ripgrep
    const args = [
      '--files',               // только список файлов
      '--glob', searchPattern, // фильтр по glob
      '--sort=modified',       // сортировка по времени модификации
      '--hidden',              // искать скрытые файлы
      '--no-ignore',           // не использовать .gitignore (можно сделать опциональным позже)
    ];

    // Исключаем VCS-директории
    for (const dir of VCS_DIRECTORIES) {
      args.push('--glob', `!${dir}`);
    }

    args.push('.'); // искать в текущей директории (searchDir будет cwd)

    // 4️⃣ Запускаем ripgrep
    let lines;
    try {
      lines = await ripGrep(args, searchDir, signal);
    } catch (error) {
      if (error.message && error.message.includes('exited with code 1')) {
        // нет совпадений – не ошибка
        return {
          filenames: [],
          numFiles: 0,
          truncated: false,
          durationMs: Date.now() - start,
        };
      }
      throw new Error(`Ripgrep error: ${error.message}`);
    }

    // 5️⃣ ripgrep возвращает относительные пути от searchDir
    // Преобразуем в абсолютные, чтобы отсортировать по mtime (хотя --sort=modified уже сортирует)
    const absolutePaths = lines.map((line) => path.join(searchDir, line));

    // Дополнительная сортировка по mtime (на случай, если ripgrep не дал правильный порядок)
    const stats = await Promise.all(
      absolutePaths.map(async (filePath) => {
        const stat = await fileStatSafe(filePath);
        return { filePath, mtime: stat ? stat.mtimeMs : 0 };
      }),
    );
    stats.sort((a, b) => b.mtime - a.mtime); // самые новые первыми
    const sortedAbsolutePaths = stats.map((s) => s.filePath);

    // 6️⃣ Применяем offset и limit
    const totalFiles = sortedAbsolutePaths.length;
    const sliced = sortedAbsolutePaths.slice(offset, limit === 0 ? undefined : offset + limit);
    const truncated = totalFiles > offset + sliced.length;

    // 7️⃣ Конвертируем обратно в относительные пути от песочницы (экономия токенов)
    const filenames = sliced.map((absPath) => toRelativePath(absPath, sandboxRoot));

    return {
      filenames,
      numFiles: filenames.length,
      truncated,
      durationMs: Date.now() - start,
    };
  }
}

// Регистрируем инструмент
const tool = new GlobTool();
registry.register(tool);
module.exports = tool;
