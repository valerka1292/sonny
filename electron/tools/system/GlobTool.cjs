const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const fs = require('fs/promises');
const path = require('path');
const { ripGrep } = require('../../ripgrep.cjs');
const {
  checkPathInSandbox,
  toRelativePath,
  extractGlobBaseDirectory,
} = require('../utils/sandbox.cjs');

const MAX_RESULTS = 100;
const DESCRIPTION = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`;

class GlobTool extends Tool {
  constructor() {
    super();
    this.name = 'Glob';
    this.description = DESCRIPTION;
    this.mode = 'ro';

    this.inputSchema = z.strictObject({
      pattern: z.string().describe('The glob pattern to match files against'),
      search_path: z.string().optional().describe('The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" — simply omit it for the default behavior. Must be a valid directory path if provided. Distinct from the `file_path` field used by Read/Write/Edit — here it is the search root, not a target file.'),
    });

    this.outputSchema = z.object({
      durationMs: z.number().describe('Time taken to execute the search in milliseconds'),
      numFiles: z.number().describe('Total number of files found'),
      filenames: z.array(z.string()).describe('Array of file paths that match the pattern'),
      truncated: z.boolean().describe('Whether results were truncated (limited to 100 files)'),
    });
  }

  async execute(input, context) {
    const start = Date.now();
    const { cwd: sandboxRoot, signal } = context;

    if (input.search_path) {
      const absolutePath = checkPathInSandbox(input.search_path, sandboxRoot);
      let stat;
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        const error = new Error(`Directory does not exist: ${input.search_path}. The current working directory is ${sandboxRoot}.`);
        error.code = 1;
        throw error;
      }
      if (!stat.isDirectory()) {
        const error = new Error(`Path is not a directory: ${input.search_path}`);
        error.code = 2;
        throw error;
      }
    }

    let searchDir = input.search_path ? checkPathInSandbox(input.search_path, sandboxRoot) : sandboxRoot;
    let searchPattern = input.pattern;

    if (path.isAbsolute(input.pattern)) {
      const { baseDir, relativePattern } = extractGlobBaseDirectory(input.pattern);
      if (baseDir) {
        searchDir = checkPathInSandbox(baseDir, sandboxRoot);
        searchPattern = relativePattern;
      }
    }

    const args = [
      '--files',
      '--glob',
      searchPattern,
      '--sort=modified',
      '--no-ignore',
      '--hidden',
    ];

    const allPaths = await ripGrep(args, searchDir, signal, { cwd: searchDir });
    const absolutePaths = allPaths.map(p => path.isAbsolute(p) ? p : path.join(searchDir, p));

    const truncated = absolutePaths.length > MAX_RESULTS;
    const files = absolutePaths.slice(0, MAX_RESULTS);
    const filenames = files.map(absPath => toRelativePath(absPath, sandboxRoot));

    return {
      filenames,
      durationMs: Date.now() - start,
      numFiles: filenames.length,
      truncated,
    };
  }
}

const tool = new GlobTool();
registry.register(tool);
module.exports = tool;
