const electron = (window as any).electron;

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mode: 'ro' | 'rw';
}

export async function listTools(): Promise<ToolInfo[]> {
  return electron.tools?.list() ?? [];
}

export async function executeTool(
  name: string,
  input: unknown,
  meta?: { chatId?: string | null },
): Promise<any> {
  if (!electron.tools) throw new Error('Tool API not available');
  console.log(`[ToolBridge] Executing tool: ${name}`, input);
  return electron.tools.execute(name, input, meta);
}

export async function getSystemPrompt(chatId?: string | null): Promise<string> {
  if (!electron?.getSystemPrompt) return 'I am Sonny.';
  return electron.getSystemPrompt(chatId ?? null);
}
