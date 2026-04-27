const { Tool } = require('./Tool.cjs');
const { z } = require('zod');

// Zod 4 ships its own JSON-Schema converter. We were previously using the
// `zod-to-json-schema` package, which silently returns `{}` for Zod 4
// schemas — the OpenAPI 3 target hits a no-op path in the package's Zod-3
// codepath. With an empty schema, OpenAI-compatible providers showed every
// tool as taking no arguments, and the model was inferring shapes purely
// from the description text. Switching to `z.toJSONSchema` produces a
// proper structured schema, which makes calls dramatically more reliable
// — especially for AskUserQuestion's nested questions/options shape.
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
      // Drop the `$schema` field — OpenAI / Gemini tool-call schemas don't
      // expect it and some providers reject unknown top-level keys.
      const jsonSchema = z.toJSONSchema(schema);
      if (jsonSchema && typeof jsonSchema === 'object' && '$schema' in jsonSchema) {
        const { $schema, ...rest } = jsonSchema;
        return rest;
      }
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
