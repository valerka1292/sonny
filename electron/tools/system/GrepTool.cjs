const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const path = require('path');
const fs = require('fs/promises');
const { ripGrep } = require('../../ripgrep.cjs');

// ─── Константы ────────────────────────────────────────────────
const VCS_DIRECTORIES = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];
const DEFAULT_HEAD_LIMIT = 250;

// ─── Вспомогательные функции ──────────────────────────────────
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

class GrepTool extends Tool {
  constructor() {
    super();
    this.name = 'Grep';
    this.description = 'Search file contents with regex (ripgrep)';
    this.ro = true;
    this.rw = false;

    this.inputSchema = z.object({
      pattern: z.string().describe('The regular expression pattern to search for in file contents'),
      path: z.string().optional().describe('File or directory to search in. Defaults to current working directory.'),
      glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob'),
      output_mode: z.enum(['content', 'files_with_matches', 'count']).optional().default('files_with_matches')
        .describe('Output mode: "content" shows matching lines, "files_with_matches" shows file paths, "count" shows match counts.'),
      '-i': z.boolean().optional().describe('Case insensitive search'),
      head_limit: z.number().optional().describe('Limit output to first N entries. Defaults to 250. Pass 0 for unlimited.'),
      offset: z.number().optional().default(0).describe('Skip first N entries before applying head_limit.'),
    });

    this.outputSchema = z.object({
      mode: z.enum(['content', 'files_with_matches', 'count']),
      numFiles: z.number(),
      filenames: z.array(z.string()),
      content: z.string().optional(),
      numLines: z.number().optional(),
      numMatches: z.number().optional(),
      appliedLimit: z.number().optional(),
      appliedOffset: z.number().optional(),
    });
  }

  checkPathInSandbox(userPath, cwd) {
    const resolved = path.resolve(cwd, userPath || '.');
    const sandboxRoot = path.resolve(cwd);
    if (!resolved.startsWith(sandboxRoot + path.sep) && resolved !== sandboxRoot) {
      throw new Error(`Access denied: path '${userPath}' is outside the sandbox.`);
    }
    return resolved;
  }

  async execute(input, context) {
    const { cwd, signal } = context;
    const absolutePath = this.checkPathInSandbox(input.path, cwd);

    const args = ['--hidden'];
    for (const dir of VCS_DIRECTORIES) {
      args.push('--glob', `!${dir}`);
    }
    args.push('--max-columns', '500');

    if (input['-i']) args.push('-i');

    if (input.output_mode === 'files_with_matches') {
      args.push('-l');
    } else if (input.output_mode === 'count') {
      args.push('-c');
    }

    if (input.output_mode === 'content') {
      args.push('-n');
    }

    if (input.pattern.startsWith('-')) {
      args.push('-e', input.pattern);
    } else {
      args.push(input.pattern);
    }

    if (input.glob) {
      const patterns = input.glob.split(/\s+/).filter(Boolean);
      for (const p of patterns) args.push('--glob', p);
    }

    try {
      const lines = await ripGrep(args, absolutePath, signal);

      if (input.output_mode === 'content') {
        const { items: limitedLines, appliedLimit } = applyHeadLimit(lines, input.head_limit, input.offset);
        const finalLines = limitedLines.map(line => {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const filePath = line.substring(0, colonIndex);
            const rest = line.substring(colonIndex);
            return toRelativePath(filePath, absolutePath) + rest;
          }
          return line;
        });

        return {
          mode: 'content',
          numFiles: 0,
          filenames: [],
          content: finalLines.join('\n'),
          numLines: finalLines.length,
          appliedLimit,
          appliedOffset: input.offset > 0 ? input.offset : undefined,
        };
      }

      if (input.output_mode === 'count') {
        const { items: limitedLines, appliedLimit } = applyHeadLimit(lines, input.head_limit, input.offset);
        let totalMatches = 0;
        let fileCount = 0;
        const finalLines = limitedLines.map(line => {
          const colonIndex = line.lastIndexOf(':');
          if (colonIndex > 0) {
            const filePath = line.substring(0, colonIndex);
            const countStr = line.substring(colonIndex + 1);
            const count = parseInt(countStr, 10);
            if (!isNaN(count)) {
              totalMatches += count;
              fileCount++;
            }
            return toRelativePath(filePath, absolutePath) + ':' + countStr;
          }
          return line;
        });

        return {
          mode: 'count',
          numFiles: fileCount,
          filenames: [],
          content: finalLines.join('\n'),
          numMatches: totalMatches,
          appliedLimit,
          appliedOffset: input.offset > 0 ? input.offset : undefined,
        };
      }

      // files_with_matches
      const stats = await Promise.all(
        lines.map(async (filePath) => {
          const stat = await fileStatSafe(filePath);
          return { filePath, mtime: stat ? stat.mtimeMs : 0 };
        })
      );
      stats.sort((a, b) => b.mtime - a.mtime);
      const sortedPaths = stats.map(s => s.filePath);

      const { items: finalPaths, appliedLimit } = applyHeadLimit(sortedPaths, input.head_limit, input.offset);
      const relativePaths = finalPaths.map(p => toRelativePath(p, absolutePath));

      return {
        mode: 'files_with_matches',
        filenames: relativePaths,
        numFiles: relativePaths.length,
        appliedLimit,
        appliedOffset: input.offset > 0 ? input.offset : undefined,
      };
    } catch (error) {
      if (error.message && error.message.includes('exited with code 1')) {
        return {
          mode: input.output_mode || 'files_with_matches',
          numFiles: 0,
          filenames: [],
        };
      }
      throw new Error(`Ripgrep error: ${error.message}`);
    }
  }
}

const tool = new GrepTool();
registry.register(tool);
module.exports = tool;
