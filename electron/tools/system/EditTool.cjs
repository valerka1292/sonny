// Edit tool — ports Claude Code's FileEditTool ("Edit") semantics into sonny:
// strict input schema, exact-match precondition (with curly-quote normalisation),
// replace_all behaviour, two-phase preview/apply for the rw confirmation flow,
// and the same structured-patch output shape WriteTool already produces so the
// existing DiffRenderer + StreamingPreviewOrchestrator can render diffs.

const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const path = require('path');
const fs = require('fs/promises');
const {
  checkProjectFilePath,
  atomicWriteFile,
  toRelativePath,
} = require('../utils/sandbox.cjs');
const { generateDiffHunks } = require('./diffGenerator.cjs');
const { readFileState } = require('./readFileState.cjs');
const {
  findActualString,
  applyEditToFile,
  preserveQuoteStyle,
} = require('./editUtils.cjs');

// 1 GiB. V8/Bun string length limit is ~2^30 chars; 1 GiB on disk is a safe
// byte-level guard against OOM even for multi-byte UTF-8 files. Same value as
// Claude Code's FileEditTool MAX_EDIT_FILE_SIZE.
const MAX_EDIT_FILE_SIZE = 1024 * 1024 * 1024;

class EditTool extends Tool {
  constructor() {
    super();
    this.name = 'Edit';
    this.description = `Performs exact string replacements in files.

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, preserve the exact indentation (tabs/spaces) of the matched region.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required — use \`Write\` for that.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`;
    this.mode = 'rw';

    this.inputSchema = z.strictObject({
      file_path: z.string().describe('Absolute or relative path to the file to edit. Must be inside the current branch and include a project folder, e.g. "project-name/file.ext".'),
      old_string: z.string().describe('The text to replace. Must match exactly (whitespace + indentation).'),
      new_string: z.string().describe('The text to replace it with (must be different from old_string).'),
      replace_all: z.boolean().optional().describe('Replace all occurrences of old_string. Defaults to false.'),
      apply: z.boolean().optional().describe('Internal flag. When true, commits the prepared edit to disk.'),
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
      type: z.literal('update'),
      filePath: z.string(),
      content: z.string(),
      oldString: z.string(),
      newString: z.string(),
      replaceAll: z.boolean(),
      structuredPatch: z.array(diffHunkSchema),
      originalFile: z.string(),
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

    if (input.old_string === input.new_string) {
      throw new Error('No changes to make: old_string and new_string are exactly the same.');
    }

    let stat;
    try {
      stat = await fs.stat(fullFilePath, { signal: context.signal });
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `File does not exist: ${toRelativePath(fullFilePath, cwd)}. Use the Write tool to create new files.`,
        );
      }
      throw error;
    }

    if (!stat.isFile()) {
      throw new Error(`Path is not a file: ${toRelativePath(fullFilePath, cwd)}`);
    }
    if (stat.size > MAX_EDIT_FILE_SIZE) {
      throw new Error(
        `File is too large to edit (${stat.size} bytes). Maximum editable size is ${MAX_EDIT_FILE_SIZE} bytes.`,
      );
    }

    const lastRead = readFileState.get(fullFilePath);
    if (!lastRead) {
      throw new Error(
        `File has not been read yet. Call \`Read\` on "${input.file_path}" first this turn, then retry the Edit.`,
      );
    }
    if (stat.mtimeMs > lastRead.timestamp) {
      throw new Error(
        `File has been modified since it was read. Call \`Read\` on "${input.file_path}" again to re-sync, then retry the Edit.`,
      );
    }

    const originalFile = await fs.readFile(fullFilePath, { encoding: 'utf-8', signal: context.signal });

    const actualOldString = findActualString(originalFile, input.old_string);
    if (actualOldString === null) {
      throw new Error(
        `\`old_string\` was not found in "${input.file_path}". Re-\`Read\` the file and copy the exact substring you want to replace (including surrounding whitespace and indentation), then retry. Do not paraphrase.\nString you sent: ${JSON.stringify(input.old_string)}`,
      );
    }

    const replaceAll = Boolean(input.replace_all);
    const matches = originalFile.split(actualOldString).length - 1;
    if (matches > 1 && !replaceAll) {
      throw new Error(
        `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${input.old_string}`,
      );
    }

    const actualNewString = preserveQuoteStyle(input.old_string, actualOldString, input.new_string);
    const updatedFile = applyEditToFile(originalFile, actualOldString, actualNewString, replaceAll);

    if (updatedFile === originalFile) {
      throw new Error('Edit produced no changes. Aborting.');
    }

    const structuredPatch = await generateDiffHunks(originalFile, updatedFile, {
      signal: context.signal,
      timeoutMs: context.timeoutMs,
    });
    const relativePath = toRelativePath(fullFilePath, cwd);
    const shouldApply = Boolean(input.apply);

    if (shouldApply) {
      await atomicWriteFile(fullFilePath, updatedFile, { signal: context.signal });
      readFileState.set(fullFilePath, {
        content: updatedFile,
        timestamp: Date.now(),
      });
    }

    return {
      type: 'update',
      filePath: relativePath,
      content: updatedFile,
      oldString: actualOldString,
      newString: actualNewString,
      replaceAll,
      structuredPatch,
      originalFile,
      diff: {
        filePath: relativePath,
        hunks: structuredPatch,
      },
      applied: shouldApply,
    };
  }
}

const tool = new EditTool();
registry.register(tool);

module.exports = { EditTool: tool };
