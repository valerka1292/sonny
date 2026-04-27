/**
 * Renderer-side cache of "what we last saw on disk" for files that the agent
 * has read. Populated whenever a `Read`-style tool succeeds; consumed by the
 * streaming-diff orchestrator so it can compute the diff between the live
 * `content` argument streamed by the LLM and the previous file contents
 * without an IPC round-trip.
 */
const cache = new Map<string, string>();

const MAX_ENTRIES = 256;

export function rememberFileContent(filePath: string, content: string): void {
  if (!filePath) return;
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.delete(filePath);
  cache.set(filePath, content);
}

export function getCachedFileContent(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  return cache.get(filePath);
}

export function forgetFileContent(filePath: string): void {
  cache.delete(filePath);
}
