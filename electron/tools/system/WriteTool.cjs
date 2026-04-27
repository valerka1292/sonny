const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const path = require('path');
const fs = require('fs/promises');
const { checkProjectFilePath, atomicWriteFile, toRelativePath } = require('../utils/sandbox.cjs');
const { generateDiffHunks } = require('./diffGenerator.cjs');
const { readFileState } = require('./readFileState.cjs');

class WriteTool extends Tool {
  constructor() {
    super();
    this.name = 'Write';
    this.description = `Writes a file inside the current sandbox branch.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- The path must include a project folder, e.g. "project-name/file.ext". Direct files in the branch root are rejected.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- Prefer the Edit tool for modifying existing files — it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`;
    this.mode = 'rw';

    this.inputSchema = z.strictObject({
      file_path: z.string().describe('Absolute or relative path to the file to write. Must be inside the current branch and include a project folder, e.g. "project-name/file.ext".'),
      content: z.string().describe('The content to write to the file.'),
      apply: z.boolean().optional().describe('Internal flag. When true, commits the prepared write to disk.'),
    });

    const diffLineSchema = z.object({
      type: z.enum(['context', 'addition', 'deletion']),
      content: z.string(),
      oldLine: z.number().nullable(),
      newLine: z.number().nullable(),
    });

    const diffHunkSchema = z.object({
      header: z.string(),
      oldStart: z.number(),
      oldLines: z.number(),
      newStart: z.number(),
      newLines: z.number(),
      lines: z.array(diffLineSchema),
    });

    this.outputSchema = z.object({
      type: z.enum(['create', 'update']),
      filePath: z.string(),
      content: z.string(),
      structuredPatch: z.array(diffHunkSchema),
      originalFile: z.string().nullable(),
      diff: z.object({
        filePath: z.string(),
        hunks: z.array(diffHunkSchema),
      }),
      applied: z.boolean(),
    });
  }

  async execute(rawInput, context) {
    const input = this.inputSchema.parse(rawInput);
    const { cwd } = context;
    const fullFilePath = checkProjectFilePath(input.file_path, cwd);

    await fs.mkdir(path.dirname(fullFilePath), { recursive: true, signal: context.signal });

    let oldContent = null;
    try {
      oldContent = await fs.readFile(fullFilePath, { encoding: 'utf-8', signal: context.signal });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (oldContent !== null) {
      const lastRead = readFileState.get(fullFilePath);
      if (!lastRead) {
        throw new Error(
          `File "${input.file_path}" already exists but has not been read yet. Call \`Read\` on it first this turn so you know what you're overwriting, then retry the Write — or use \`Edit\` if you only need a focused change.`,
        );
      }
      const stat = await fs.stat(fullFilePath, { signal: context.signal });
      if (stat.mtimeMs > lastRead.timestamp) {
        throw new Error(
          `File "${input.file_path}" has been modified since it was read. Call \`Read\` on it again to re-sync, then retry the Write.`,
        );
      }
    }

    const type = oldContent === null ? 'create' : 'update';
    const structuredPatch = oldContent === null
      ? []
      : await generateDiffHunks(oldContent, input.content, { signal: context.signal, timeoutMs: context.timeoutMs });
    const relativePath = toRelativePath(fullFilePath, cwd);
    const shouldApply = Boolean(input.apply);

    if (shouldApply) {
      await atomicWriteFile(fullFilePath, input.content, { signal: context.signal });
      readFileState.set(fullFilePath, {
        content: input.content,
        timestamp: Date.now(),
      });
    }

    return {
      type,
      filePath: relativePath,
      content: input.content,
      structuredPatch,
      originalFile: oldContent,
      diff: {
        filePath: relativePath,
        hunks: structuredPatch,
      },
      applied: shouldApply,
    };
  }
}

const tool = new WriteTool();
registry.register(tool);

module.exports = { WriteTool: tool };
