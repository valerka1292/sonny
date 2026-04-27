// Quote-normalization + edit-application helpers, ported from Claude Code's
// FileEditTool/utils.ts (https://github.com/anthropics/claude-code) with the
// pieces sonny doesn't need (LSP, file history, settings validation) stripped.

const LEFT_SINGLE_CURLY_QUOTE = '\u2018';
const RIGHT_SINGLE_CURLY_QUOTE = '\u2019';
const LEFT_DOUBLE_CURLY_QUOTE = '\u201C';
const RIGHT_DOUBLE_CURLY_QUOTE = '\u201D';

function normalizeQuotes(str) {
  return str
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"');
}

function stripTrailingWhitespace(str) {
  const lines = str.split(/(\r\n|\n|\r)/);
  let result = '';
  for (let i = 0; i < lines.length; i += 1) {
    const part = lines[i];
    if (part === undefined) continue;
    if (i % 2 === 0) {
      result += part.replace(/\s+$/, '');
    } else {
      result += part;
    }
  }
  return result;
}

/**
 * Finds the actual string in fileContent that matches searchString, accounting
 * for curly-quote normalization. Returns the substring as it appears in the
 * file (so the caller can preserve the file's typography), or null.
 */
function findActualString(fileContent, searchString) {
  if (fileContent.includes(searchString)) return searchString;

  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedFile = normalizeQuotes(fileContent);
  const idx = normalizedFile.indexOf(normalizedSearch);
  if (idx === -1) return null;
  return fileContent.substring(idx, idx + searchString.length);
}

function isOpeningContext(chars, index) {
  if (index === 0) return true;
  const prev = chars[index - 1];
  return (
    prev === ' ' ||
    prev === '\t' ||
    prev === '\n' ||
    prev === '\r' ||
    prev === '(' ||
    prev === '[' ||
    prev === '{' ||
    prev === '\u2014' ||
    prev === '\u2013'
  );
}

function applyCurlyDoubleQuotes(str) {
  const chars = [...str];
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === '"') {
      out.push(isOpeningContext(chars, i) ? LEFT_DOUBLE_CURLY_QUOTE : RIGHT_DOUBLE_CURLY_QUOTE);
    } else {
      out.push(chars[i]);
    }
  }
  return out.join('');
}

function applyCurlySingleQuotes(str) {
  const chars = [...str];
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === "'") {
      const prev = i > 0 ? chars[i - 1] : undefined;
      const next = i < chars.length - 1 ? chars[i + 1] : undefined;
      const prevIsLetter = prev !== undefined && /\p{L}/u.test(prev);
      const nextIsLetter = next !== undefined && /\p{L}/u.test(next);
      if (prevIsLetter && nextIsLetter) {
        out.push(RIGHT_SINGLE_CURLY_QUOTE);
      } else {
        out.push(isOpeningContext(chars, i) ? LEFT_SINGLE_CURLY_QUOTE : RIGHT_SINGLE_CURLY_QUOTE);
      }
    } else {
      out.push(chars[i]);
    }
  }
  return out.join('');
}

/**
 * If old_string only matched after curly-quote normalization, apply the file's
 * curly-quote style to new_string so the edit doesn't silently flatten
 * typography.
 */
function preserveQuoteStyle(oldString, actualOldString, newString) {
  if (oldString === actualOldString) return newString;

  const hasDoubleQuotes =
    actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE);
  const hasSingleQuotes =
    actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE);

  if (!hasDoubleQuotes && !hasSingleQuotes) return newString;

  let result = newString;
  if (hasDoubleQuotes) result = applyCurlyDoubleQuotes(result);
  if (hasSingleQuotes) result = applyCurlySingleQuotes(result);
  return result;
}

/**
 * Apply a single edit (old_string -> new_string) to file content. Mirrors
 * Claude Code's `applyEditToFile` semantics, including the trailing-newline
 * handling for deletions.
 */
function applyEditToFile(originalContent, oldString, newString, replaceAll = false) {
  const replaceFn = replaceAll
    ? (content, search, replace) => content.replaceAll(search, () => replace)
    : (content, search, replace) => content.replace(search, () => replace);

  if (newString !== '') {
    return replaceFn(originalContent, oldString, newString);
  }

  const stripTrailingNewline =
    !oldString.endsWith('\n') && originalContent.includes(oldString + '\n');

  return stripTrailingNewline
    ? replaceFn(originalContent, oldString + '\n', newString)
    : replaceFn(originalContent, oldString, newString);
}

module.exports = {
  findActualString,
  applyEditToFile,
  preserveQuoteStyle,
  normalizeQuotes,
  stripTrailingWhitespace,
};
