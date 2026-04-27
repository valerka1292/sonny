const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { readTodos } = require('./tools/system/todoStore.cjs');

let cachedStaticPrompt = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 sec

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
  return `${staticPart}\n\n${dynamicPart}`;
}

module.exports = { getSystemPrompt };
