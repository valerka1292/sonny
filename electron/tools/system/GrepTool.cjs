const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const { ripGrep } = require('../../ripgrep.cjs');
const {
  checkPathInSandbox,
  fileStatSafe,
  toRelativePath,
} = require('../utils/sandbox.cjs');

const VCS_DIRECTORIES_TO_EXCLUDE = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];
const DEFAULT_HEAD_LIMIT = 250;

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
    this.description = 'A powerful search tool built on ripgrep';
    this.mode = 'ro';

    this.inputSchema = z.strictObject({
      pattern: z.string().describe('The regular expression pattern to search for in file contents'),
      path: z.string().optional().describe('File or directory to search in (rg PATH). Defaults to current working directory.'),
      glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob'),
      output_mode: z.enum(['content', 'files_with_matches', 'count']).optional().describe('Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".'),
      '-B': z.number().optional().describe('Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.'),
      '-A': z.number().optional().describe('Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.'),
      '-C': z.number().optional().describe('Alias for context.'),
      context: z.number().optional().describe('Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.'),
      '-n': z.boolean().optional().describe('Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise. Defaults to true.'),
      '-i': z.boolean().optional().describe('Case insensitive search (rg -i)'),
      type: z.string().optional().describe('File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.'),
      head_limit: z.number().optional().describe('Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 250 when unspecified. Pass 0 for unlimited (use sparingly — large result sets waste context).'),
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

  async execute(input, context) {
    const { cwd, signal } = context;
    const absolutePath = checkPathInSandbox(input.path || '.', cwd);
    const output_mode = input.output_mode || 'files_with_matches';
    const offset = input.offset || 0;
    const showLineNumbers = input['-n'] !== undefined ? input['-n'] : true;

    const args = ['--hidden'];
    for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
      args.push('--glob', `!${dir}`);
    }
    args.push('--max-columns', '500');

    if (input.multiline) args.push('-U', '--multiline-dotall');
    if (input['-i']) args.push('-i');

    if (output_mode === 'files_with_matches') args.push('-l');
    if (output_mode === 'count') args.push('-c');

    if (showLineNumbers && output_mode === 'content') args.push('-n');

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

    if (input.pattern.startsWith('-')) args.push('-e', input.pattern);
    else args.push(input.pattern);

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

    const results = await ripGrep(args, absolutePath, signal, { cwd });

    if (output_mode === 'content') {
      const { items: limitedResults, appliedLimit } = applyHeadLimit(results, input.head_limit, offset);
      const finalLines = limitedResults.map(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const filePath = line.substring(0, colonIndex);
          const rest = line.substring(colonIndex);
          return toRelativePath(filePath, cwd) + rest;
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

    const stats = await Promise.allSettled(results.map(filePath => fileStatSafe(filePath)));
    const sortedMatches = results
      .map((filePath, i) => [filePath, stats[i].status === 'fulfilled' && stats[i].value ? stats[i].value.mtimeMs || 0 : 0])
      .sort((a, b) => {
        const timeComparison = b[1] - a[1];
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
