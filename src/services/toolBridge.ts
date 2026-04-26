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

export async function executeTool(name: string, input: unknown): Promise<any> {
  if (!electron.tools) throw new Error('Tool API not available');
  console.log(`[ToolBridge] Executing tool: ${name}`, input);
  return electron.tools.execute(name, input);
}

export async function getSystemPrompt(): Promise<string> {
  if (!electron?.getSystemPrompt) return 'I am Sonny.';
  return electron.getSystemPrompt();
}
