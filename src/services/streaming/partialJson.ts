import { Allow, parse } from 'partial-json';

/**
 * Best-effort parse of an in-flight JSON argument string streamed from an LLM
 * tool call. Returns whatever it can recover; never throws.
 *
 * Industry reference: this is the same approach used by Anthropic SDK
 * (`MessageStream.accumulate()` + `input_json_delta`) and Vercel AI SDK v3
 * (`tool-call-streaming` events) — partial JSON is parsed on every delta so
 * the UI can react before the tool call is finalized.
 */
export function parsePartialJson(rawArgs: string | undefined): Record<string, unknown> | undefined {
  if (!rawArgs) return undefined;
  try {
    const parsed = parse(rawArgs, Allow.ALL);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function getPartialString(args: Record<string, unknown> | undefined, field: string): string | undefined {
  if (!args) return undefined;
  const value = args[field];
  return typeof value === 'string' ? value : undefined;
}
