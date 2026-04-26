const { z } = require('zod');

class Tool {
  /** @type {string} */
  name;
  /** @type {string} */
  description;
  /** @type {z.ZodTypeAny} */
  inputSchema;
  /** @type {z.ZodTypeAny} */
  outputSchema;
  /** @type {boolean} */
  ro = true;
  /** @type {boolean} */
  rw = false;
  /** @type {'system'|'custom'} */
  category = 'system';

  /**
   * @param {object} input - валидированный вход
   * @param {{ signal?: AbortSignal, cwd: string }} context
   * @returns {Promise<object>}
   */
  async execute(input, context) {
    throw new Error('Not implemented');
  }
}

module.exports = { Tool };
