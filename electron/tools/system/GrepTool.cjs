const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const { ripGrep } = require('../../ripgrep.cjs');
const {
  checkPathInSandbox,
  fileStatSafe,
  toRelativePath,
} = require('../utils/sandbox.cjs');

// Директории систем контроля версий, которые исключаем из поиска
const VCS_DIRECTORIES_TO_EXCLUDE = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];
const DEFAULT_HEAD_LIMIT = 250;

/**
 * Применяет limit/offset к результатам (пагинация)
 */
function applyHeadLimit(items, limit, offset = 0) {
  if (limit === 0) {
    return { items: items.slice(offset), appliedLimit: undefined };
  }
  const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT;
  const sliced = items.slice(offset, offset + effectiveLimit);
  const wasTruncated = items.length - offset > effectiveLimit;

  return {
    items: sliced,
    appliedLimit: wasTruncated ? effectiveLimit : undefined,
  };
}

class GrepTool extends Tool {
  constructor() {
    super();
    this.name = 'Grep';
    this.description = `A powerful search tool built on ripgrep
  Usage:
  - ALWAYS use Grep for search tasks.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns, use \`multiline: true\``;
    this.mode = 'ro';

    this.inputSchema = z.strictObject({
      pattern: z.string().describe('The regular expression pattern to search for in file contents'),
      search_path: z.string().optional().describe('File or directory to search in (rg PATH). Defaults to current working directory. Distinct from the `file_path` field used by Read/Write/Edit — here it is the search root, not a target file.'),
      glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob'),
      output_mode: z.enum(['content', 'files_with_matches', 'count']).optional().describe('Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".'),
      '-B': z.number().optional().describe('Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.'),
      '-A': z.number().optional().describe('Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.'),
      '-C': z.number().optional().describe('Alias for context.'),
      context: z.number().optional().describe('Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.'),
      '-n': z.boolean().optional().describe('Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise. Defaults to true.'),
      '-i': z.boolean().optional().describe('Case insensitive search (rg -i)'),
      type: z.string().optional().describe('File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.'),
      head_limit: z.number().optional().describe('Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes. Defaults to 250 when unspecified. Pass 0 for unlimited.'),
      offset: z.number().optional().describe('Skip first N lines/entries before applying head_limit, equivalent to "| tail -n +N | head -N". Works across all output modes. Defaults to 0.'),
      multiline: z.boolean().optional().describe('Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.'),
    });

    this.outputSchema = z.object({
      mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
      numFiles: z.number(),
      filenames: z.array(z.string()),
      content: z.string().optional(),
      numLines: z.number().optional(),
      numMatches: z.number().optional(),
      appliedLimit: z.number().optional(),
      appliedOffset: z.number().optional(),
    });
  }

  // Поиск безопасного индекса двоеточия (учитывает Windows пути вроде C:\path)
  _findPathSeparatorIndex(line) {
    let colonIndex = line.indexOf(':');
    // Если это Windows и двоеточие относится к диску (C:\), ищем следующее двоеточие
    if (colonIndex === 1 && line[2] === '\\') {
      colonIndex = line.indexOf(':', 2);
    }
    return colonIndex;
  }

  async execute(rawInput, context) {
    // ПРОБЛЕМА #5 РЕШЕНА: Жесткая рантайм-валидация входящего IPC-сигнала
    const input = this.inputSchema.parse(rawInput);

    const { cwd, signal } = context;
    const absolutePath = checkPathInSandbox(input.search_path || '.', cwd);
    const output_mode = input.output_mode || 'files_with_matches';
    const offset = input.offset || 0;
    const showLineNumbers = input['-n'] !== undefined ? input['-n'] : true;

    const args = ['--hidden'];

    // Исключаем VCS
    for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
      args.push('--glob', `!${dir}`);
    }
    args.push('--max-columns', '500');

    // Флаги модификаторы
    if (input.multiline) args.push('-U', '--multiline-dotall');
    if (input['-i']) args.push('-i');

    // Режимы вывода
    if (output_mode === 'files_with_matches') args.push('-l');
    if (output_mode === 'count') args.push('-c');
    if (showLineNumbers && output_mode === 'content') args.push('-n');

    // Контекст (только для content)
    if (output_mode === 'content') {
      if (input.context !== undefined) {
        args.push('-C', String(input.context));
      } else if (input['-C'] !== undefined) {
        args.push('-C', String(input['-C']));
      } else {
        if (input['-B'] !== undefined) args.push('-B', String(input['-B']));
        if (input['-A'] !== undefined) args.push('-A', String(input['-A']));
      }
    }

    // Паттерн (если начинается с -, экранируем через -e)
    if (input.pattern.startsWith('-')) args.push('-e', input.pattern);
    else args.push(input.pattern);

    // Фильтры
    if (input.type) args.push('--type', input.type);

    if (input.glob) {
      const globPatterns = [];
      const rawPatterns = input.glob.split(/\s+/);
      for (const rawPattern of rawPatterns) {
        if (!rawPattern) continue;
        if (rawPattern.includes('{') && rawPattern.includes('}')) globPatterns.push(rawPattern);
        else globPatterns.push(...rawPattern.split(',').filter(Boolean));
      }
      for (const p of globPatterns) args.push('--glob', p);
    }

    // Запускаем поиск (ripgrep.cjs использует пакет @vscode/ripgrep, если системного нет)
    const results = await ripGrep(args, absolutePath, signal, { cwd });

    // Обработка MODE: CONTENT
    if (output_mode === 'content') {
      const { items: limitedResults, appliedLimit } = applyHeadLimit(results, input.head_limit, offset);
      const finalLines = limitedResults.map(line => {
        const colonIndex = this._findPathSeparatorIndex(line);
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex);
          const rest = line.substring(colonIndex);
          return toRelativePath(filePath, cwd) + rest; // Безопасный путь для LLM
        }
        return line;
      });
      return {
        mode: 'content',
        numFiles: 0,
        filenames: [],
        content: finalLines.join('\n'),
        numLines: finalLines.length,
        ...(appliedLimit !== undefined ? { appliedLimit } : {}),
        ...(offset > 0 ? { appliedOffset: offset } : {}),
      };
    }

    // Обработка MODE: COUNT
    if (output_mode === 'count') {
      const { items: limitedResults, appliedLimit } = applyHeadLimit(results, input.head_limit, offset);
      const finalCountLines = limitedResults.map(line => {
        const colonIndex = line.lastIndexOf(':');
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex);
          const count = line.substring(colonIndex);
          return toRelativePath(filePath, cwd) + count;
        }
        return line;
      });

      let totalMatches = 0;
      let fileCount = 0;
      for (const line of finalCountLines) {
        const idx = line.lastIndexOf(':');
        if (idx > 0) {
          const parsed = parseInt(line.substring(idx + 1), 10);
          if (!Number.isNaN(parsed)) {
            totalMatches += parsed;
            fileCount += 1;
          }
        }
      }

      return {
        mode: 'count',
        numFiles: fileCount,
        filenames: [],
        content: finalCountLines.join('\n'),
        numMatches: totalMatches,
        ...(appliedLimit !== undefined ? { appliedLimit } : {}),
        ...(offset > 0 ? { appliedOffset: offset } : {}),
      };
    }

    // Обработка MODE: FILES_WITH_MATCHES (По умолчанию)
    const stats = await Promise.allSettled(results.map(filePath => fileStatSafe(filePath)));
    const sortedMatches = results
      .map((filePath, i) => [filePath, stats[i].status === 'fulfilled' && stats[i].value ? stats[i].value.mtimeMs || 0 : 0])
      .sort((a, b) => {
        const timeComparison = b[1] - a[1]; // Сортируем по дате изменения (сначала свежие)
        if (timeComparison === 0) return a[0].localeCompare(b[0]);
        return timeComparison;
      })
      .map(entry => entry[0]);

    const { items: finalMatches, appliedLimit } = applyHeadLimit(sortedMatches, input.head_limit, offset);
    const relativeMatches = finalMatches.map(filePath => toRelativePath(filePath, cwd));

    return {
      mode: 'files_with_matches',
      filenames: relativeMatches,
      numFiles: relativeMatches.length,
      ...(appliedLimit !== undefined ? { appliedLimit } : {}),
      ...(offset > 0 ? { appliedOffset: offset } : {}),
    };
  }
}

const tool = new GrepTool();
registry.register(tool);
module.exports = tool;
