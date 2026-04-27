// Renderer-side mirror of `applyEditToFile` in electron/tools/system/editUtils.cjs.
// Used by the streaming orchestrator to project an Edit tool call's
// (old_string, new_string, replace_all) onto cached file contents so we can
// diff the projected result without going through IPC.

export function applyEditPreview(
  originalContent: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string | undefined {
  if (oldString === '') return undefined;
  if (!originalContent.includes(oldString)) return undefined;

  const replace = replaceAll
    ? (haystack: string) => haystack.replaceAll(oldString, () => newString)
    : (haystack: string) => haystack.replace(oldString, () => newString);

  if (newString !== '') {
    return replace(originalContent);
  }

  // Pure deletion — strip the trailing newline alongside the match if the
  // model didn't include it (matches editUtils.cjs behaviour).
  const stripTrailingNewline =
    !oldString.endsWith('\n') && originalContent.includes(oldString + '\n');

  if (stripTrailingNewline) {
    return replaceAll
      ? originalContent.replaceAll(oldString + '\n', () => newString)
      : originalContent.replace(oldString + '\n', () => newString);
  }
  return replace(originalContent);
}
