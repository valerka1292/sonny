const { Tool } = require('./Tool.cjs');
const { zodToJsonSchema } = require('zod-to-json-schema');

class ToolRegistry {
  constructor() {
    /** @type {Map<string, Tool>} */
    this.tools = new Map();
  }

  register(tool) {
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  list() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: this._serializeSchema(t.inputSchema),
      mode: t.mode || 'ro',
    }));
  }

  _serializeSchema(schema) {
    if (!schema) return { type: 'object' };
    try {
      // openApi3 format is most compatible with OpenAI/Gemini tool calling
      const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' });
      return jsonSchema;
    } catch (e) {
      console.error('[ToolRegistry] Failed to convert schema', e);
      return { type: 'object' };
    }
  }
}

// Создадим синглтон для main процесса
const registry = new ToolRegistry();

module.exports = { registry, ToolRegistry };
