const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { readTodos } = require('./tools/system/todoStore.cjs');

let cachedStaticPrompt = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 sec

// Hardcoded operating policy. Lives in code (not in prompts/*.md) so the user
// can't accidentally delete it and the model can't overwrite it via Write.
// Prepended AFTER the user-editable markdown so it acts as the last word on
// HOW the agent works, separate from WHO the agent is (identity.md etc.).
const TOOL_USAGE_POLICY = `# Tool Usage Policy

## Discovery before action
- If you don't know whether a file or symbol exists, find out first. Use \`Glob\` for paths and \`Grep\` for content. Never fabricate file paths or pretend a file exists because the name sounded right.
- If you're about to claim something about a file's contents, \`Read\` it first this turn. Don't paraphrase from memory.

## Choosing the right tool
- \`Glob(pattern, path?)\` — locate files by name pattern (e.g. \`**/*.ts\`). Cheap; use it freely before assuming structure.
- \`Grep(pattern, path?, glob_pattern?)\` — search file contents. Use BEFORE editing a function, to find every caller.
- \`Read(file_path, offset?, limit?)\` — load a file before you touch it, before you reason about it, and after a substantive change to verify the result.
- \`Write(file_path, content)\` — full-file replace. Use only for new files or genuine full rewrites. For surgical changes, prefer \`Edit\`.
- \`Edit(file_path, old_string, new_string, replace_all?)\` — anchored substring replacement. Requires you to have called \`Read\` on the same file in the current session first.
- \`TodoWrite(todos)\` — only for genuinely multi-step (~3+) work. Don't track trivial single-step tasks.

## Argument discipline
- Use the EXACT field names the tool's input schema declares. Common ones agents get wrong:
  - \`Read\` / \`Write\` / \`Edit\`: the path field is \`file_path\` (NOT \`path\`).
  - \`Grep\` and \`Glob\`: the field is \`pattern\` and it is required.
  - \`TodoWrite\` input is \`{ todos: [{ content, activeForm, status }] }\`. \`oldTodos\` and \`newTodos\` are OUTPUT fields you receive in the response — never pass them as input.
- Never pass \`undefined\` or \`null\` for a required field. If you don't have a value, run a discovery tool first; don't fire the call hoping it works.
- Pass strict input only — extra fields are rejected. If a schema doesn't accept a field, don't invent it.

## Reading errors
- After a tool ERRORS, READ the error message before retrying. Tool errors carry the fix.
- If the error says "File has not been read yet" — call \`Read\` on the exact \`file_path\` first, then retry the original call.
- If it says "expected field X, received Y" — rename your field. Don't re-send the same shape.
- If it says "Found N matches for old_string" — your anchor is ambiguous. Either expand \`old_string\` with surrounding context to make it unique, or set \`replace_all: true\` if you genuinely meant all occurrences.
- Never blindly retry the identical call. Each retry without a real change burns the user's tokens.

## Confirmation flow
- \`Write\` and \`Edit\` are confirmation-gated: you propose the change, the user approves or rejects. If rejected, do NOT silently retry the same change — read the rejection reason and either adjust the plan or stop and ask the user.

## TodoWrite specifics
- The list is REPLACED wholesale on every call. To remove an item, omit it. To clear, send \`todos: []\`. To preserve an item, include it again.
- Keep exactly ONE item with status \`in_progress\` while you're actively working. Mark it \`completed\` BEFORE flipping the next one to \`in_progress\`.
- Both \`content\` (imperative: "Run tests") and \`activeForm\` (continuous: "Running tests") are required on every item.`;

const CODE_WORKING_POLICY = `# Code Working Policy

You work on code the way an experienced engineer does — slowly enough to not break things, fast enough to actually ship. The four phases are not optional; skipping any of them is how regressions ship.

## Phase 1 — Understand
- \`Read\` the file you're about to change end-to-end. Not just the function: the imports at the top, the exports at the bottom, and any module-level state. The function you'll edit may rely on a module-level constant five lines below it.
- Trace the symbols you'll touch. If you'll modify a function:
  - Look at where its arguments come from (callers).
  - Look at every imported name it uses — \`Read\` or \`Grep\` the source of any import you don't already understand. Don't assume an imported \`parseFoo\` returns what its name suggests.
- Inspect adjacent code. Files in the same directory usually share conventions (naming, error handling, types). Match them.

## Phase 2 — Plan
- State the change in one sentence to yourself before acting. If you can't, you don't understand it well enough yet — go back to Phase 1.
- Identify the blast radius:
  - Who calls the function you're changing? \`Grep\` for its name across the codebase.
  - What does it return, and who consumes the return value? Will the new return shape break a downstream consumer?
  - Are there tests that pin its behaviour?
- Pick the smallest change that fixes the problem. Don't refactor while fixing a bug. Don't rename while adding a feature. Each PR does one thing.

## Phase 3 — Act
- Prefer \`Edit\` over \`Write\` for any file that already exists. \`Edit\` shows the user a focused diff; \`Write\` rewrites the whole file and looks scary in review.
- One concept per tool call. Don't bundle unrelated changes into a single \`Edit\`. If you need to change three functions, that's three \`Edit\` calls.
- Match the file's existing style: indentation, quote style, import order, naming.

## Phase 4 — Verify
- After a substantive write, \`Read\` the result back to confirm the file is what you intended.
- For changed functions, \`Grep\` for callers and confirm none of them needs an update you haven't made.
- If the project has tests, find the relevant test file (\`Glob\` for \`*test*\` near the changed file) and confirm at least one test exercises the path you changed.
- If something doesn't add up, STOP and re-enter Phase 1. Do not guess.

## Anti-patterns
- Changing a function's signature (return type, parameter list) without updating every caller in the same change.
- Introducing an import for a symbol that doesn't exist in the imported module — always verify the export with \`Read\` or \`Grep\`.
- Inferring file structure from the user's request alone. Confirm with \`Glob\` before writing.
- "Quick refactor while I'm in there" — keep the change scope honest.
- Writing a test that always passes (e.g. asserts \`true\`) just to claim coverage. The test must fail without your change.
- Fabricating file paths or dependency versions. If you're not sure, look it up first.`;

const HARDCODED_POLICY_BLOCK = `${TOOL_USAGE_POLICY}\n\n${CODE_WORKING_POLICY}`;

async function loadStaticPrompt(promptsDir) {
  const now = Date.now();
  if (cachedStaticPrompt && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedStaticPrompt;
  }

  try {
    const files = await fs.readdir(promptsDir);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort(); // Сортируем для стабильности

    const sections = await Promise.all(
      mdFiles.map(async (fileName) => {
        const content = await fs.readFile(path.join(promptsDir, fileName), 'utf-8');
        // Формат: ## filename.md\n\ncontent
        return `## ${fileName}\n\n${content.trim()}`;
      })
    );

    cachedStaticPrompt = sections.join('\n\n---\n\n');
    cacheTimestamp = now;
    return cachedStaticPrompt;
  } catch (e) {
    console.warn('[Prompts] Failed to load static prompts:', e.message);
    return '## default\n\nYou are Sonny, an autonomous AI agent.';
  }
}

const STATUS_MARKERS = {
  pending: '[ ]',
  in_progress: '[~]',
  completed: '[x]',
};

function renderTodoBlock(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return '';
  const lines = todos.map((todo) => {
    const marker = STATUS_MARKERS[todo.status] ?? '[?]';
    return `${marker} ${todo.content}`;
  });
  return [
    '',
    '## Current todo list',
    '',
    ...lines,
    '',
    'To delete the todo list entirely, call the `TodoWrite` tool with `todos: []`. The list is replaced wholesale on every `TodoWrite` call, so omitting an item removes it.',
  ].join('\n');
}

async function buildDynamicContext(cwd, chatId) {
  const now = new Date();
  const lines = [
    `# Environment Context`,
    ``,
    `**Current date:** ${now.toISOString()}`,
    `**Operating system:** ${os.platform()} ${os.release()}`,
    `**Working directory:** ${cwd}`,
    `**Mode:** Chat`,
  ];

  if (chatId) {
    try {
      const todos = await readTodos(chatId);
      const block = renderTodoBlock(todos);
      if (block) lines.push(block);
    } catch (e) {
      console.warn('[Prompts] Failed to read todos:', e.message);
    }
  }

  lines.push('', '---');
  return lines.join('\n');
}

async function getSystemPrompt(cwd, promptsDir, chatId) {
  const staticPart = await loadStaticPrompt(promptsDir);
  const dynamicPart = await buildDynamicContext(cwd, chatId ?? null);
  // Order: user-editable identity (markdown) → hardcoded operating policy →
  // dynamic environment + todos. The policy sits AFTER the markdown so it
  // acts as the last word on *how* the agent works, regardless of what the
  // user puts in their persona files.
  return `${staticPart}\n\n${HARDCODED_POLICY_BLOCK}\n\n${dynamicPart}`;
}

module.exports = { getSystemPrompt };
