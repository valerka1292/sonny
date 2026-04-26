const fs = require('fs/promises');
const path = require('path');
const os = require('os');

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

function buildDynamicContext(cwd) {
  const now = new Date();
  return [
    `# Environment Context`,
    ``,
    `**Current date:** ${now.toISOString()}`,
    `**Operating system:** ${os.platform()} ${os.release()}`,
    `**Working directory:** ${cwd}`,
    `**Mode:** Chat`,
    ``,
    `---`,
  ].join('\n');
}

async function getSystemPrompt(cwd, promptsDir) {
  const staticPart = await loadStaticPrompt(promptsDir);
  const dynamicPart = buildDynamicContext(cwd);
  return `${staticPart}\n\n${dynamicPart}`;
}

module.exports = { getSystemPrompt };
