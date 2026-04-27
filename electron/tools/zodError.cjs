/**
 * Convert a Zod v4 SafeParseError into a structured, model-friendly hint
 * that explicitly tells the LLM:
 *   - what fields it sent
 *   - what fields the tool actually accepts
 *   - issue-by-issue, what's wrong and how to phrase it correctly
 *
 * The original Zod `error.message` is preserved at the bottom for cases the
 * model is already used to parsing.
 */

function getAllowedKeys(schema) {
  // ZodObject / ZodStrictObject: `schema.shape` is the property map.
  try {
    const shape = schema?.shape;
    if (shape && typeof shape === 'object') {
      return Object.keys(shape);
    }
  } catch {
    // ignore
  }
  return null;
}

function getSentKeys(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return Object.keys(input);
  }
  return [];
}

function describePath(p) {
  if (!Array.isArray(p) || p.length === 0) return '<root>';
  return p.map((seg) => (typeof seg === 'number' ? `[${seg}]` : seg)).join('.');
}

function describeIssue(issue) {
  const at = describePath(issue.path);
  switch (issue.code) {
    case 'invalid_type': {
      const got = issue.received ?? 'undefined';
      return `at \`${at}\`: expected ${issue.expected}, received ${got}.`;
    }
    case 'unrecognized_keys': {
      const keys = (issue.keys ?? []).map((k) => `\`${k}\``).join(', ');
      return `at \`${at}\`: unknown field(s) ${keys}. The schema is strict — only declared fields are allowed.`;
    }
    case 'too_small': {
      const min = issue.minimum;
      return `at \`${at}\`: value is too small (minimum ${min}). ${issue.message ?? ''}`.trim();
    }
    case 'too_big': {
      const max = issue.maximum;
      return `at \`${at}\`: value is too big (maximum ${max}). ${issue.message ?? ''}`.trim();
    }
    case 'invalid_value':
    case 'invalid_enum_value': {
      const opts = Array.isArray(issue.options) ? issue.options.map((o) => JSON.stringify(o)).join(', ') : null;
      return `at \`${at}\`: invalid value. ${opts ? `Allowed: ${opts}.` : ''}`.trim();
    }
    case 'invalid_format':
      return `at \`${at}\`: ${issue.message ?? 'invalid format'}.`;
    case 'custom':
      return `at \`${at}\`: ${issue.message ?? 'failed validation'}.`;
    default:
      return `at \`${at}\`: ${issue.message ?? issue.code}.`;
  }
}

/**
 * @param {string} toolName
 * @param {unknown} input  the raw input as given by the model
 * @param {import('zod').ZodSchema} schema
 * @param {import('zod').ZodError} zodError
 * @returns {string}
 */
function formatZodError(toolName, input, schema, zodError) {
  const allowed = getAllowedKeys(schema);
  const sent = getSentKeys(input);
  const issues = (zodError.issues ?? []).map((iss) => `  - ${describeIssue(iss)}`).join('\n');

  const lines = [
    `Tool "${toolName}" input validation failed.`,
    sent.length > 0 ? `You sent fields: [${sent.map((k) => `"${k}"`).join(', ')}]` : `You sent no fields.`,
  ];
  if (allowed) {
    lines.push(`Allowed fields: [${allowed.map((k) => `"${k}"`).join(', ')}]`);
  }
  lines.push('Issues:');
  lines.push(issues || '  - (no per-field issues reported; see schema for shape)');
  lines.push('Fix the arguments to match the tool\'s input schema and retry.');
  return lines.join('\n');
}

module.exports = { formatZodError };
