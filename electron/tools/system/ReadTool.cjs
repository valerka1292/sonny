const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const path = require('path');
const fs = require('fs/promises');
const { checkPathInSandbox, toRelativePath } = require('../utils/sandbox.cjs');

const MAX_SIZE_BYTES = 256 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.zip', '.tar', '.gz',
]);

class ReadTool extends Tool {
  constructor() {
    super();
    this.name = 'Read';
    this.description = 'Read a text file from the local sandbox filesystem.';
    this.mode = 'ro';

    this.inputSchema = z.strictObject({
      file_path: z.string().describe('Absolute or relative path to the file. Must be inside the sandbox.'),
      offset: z.number().int().min(1).optional().describe('Line number to start reading from (1-indexed).'),
      limit: z.number().int().min(1).optional().describe('Maximum number of lines to read.'),
    });

    this.outputSchema = z.object({
      filePath: z.string(),
      content: z.string(),
      numLines: z.number(),
      startLine: z.number(),
      totalLines: z.number(),
    });
  }

  async execute(input, context) {
    const { cwd } = context;
    const absolutePath = checkPathInSandbox(input.file_path, cwd);

    const ext = path.extname(absolutePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      throw new Error(`Cannot read binary file with extension ${ext}`);
    }

    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File does not exist: ${toRelativePath(absolutePath, cwd)}`);
      }
      throw error;
    }

    if (!stat.isFile()) {
      throw new Error(`Path is not a file: ${toRelativePath(absolutePath, cwd)}`);
    }

    if (stat.size > MAX_SIZE_BYTES) {
      throw new Error(
        `File is too large (${stat.size} bytes). Maximum allowed is ${MAX_SIZE_BYTES} bytes. Use offset/limit to read a smaller portion.`,
      );
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    const offset = input.offset || 1;
    const limit = input.limit ?? totalLines;
    const startIndex = offset - 1;
    const endIndex = Math.min(startIndex + limit, totalLines);
    const sliced = lines.slice(startIndex, endIndex);

    return {
      filePath: toRelativePath(absolutePath, cwd),
      content: sliced.join('\n'),
      numLines: sliced.length,
      startLine: offset,
      totalLines,
    };
  }
}

const tool = new ReadTool();
registry.register(tool);
module.exports = tool;
