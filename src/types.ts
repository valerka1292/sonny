export type AgentMode = 'Chat' | 'Autonomy' | 'Improve' | 'Dream';

export interface ToolCallResult {
  status: 'running' | 'success' | 'error';
  error?: string;
  output?: any;
}

export interface ToolCallStreamingPreview {
  parsedArgs?: Record<string, unknown>;
  diff?: DiffFile;
}

export interface ToolCall {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
  result?: ToolCallResult;
  streamingPreview?: ToolCallStreamingPreview;
}

export interface ToolRendererProps {
  toolCall: ToolCall;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  thinking?: string;
  toolCalls?: ToolCall[];
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  thinking?: string;
  toolCalls?: ToolCall[];
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
}

export interface ChatData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  llmHistory: LlmHistoryMessage[];
  contextTokensUsed: number;
  pinned?: boolean;
}

export interface LlmHistoryMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface Provider {
  id: string;
  visualName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  contextWindowSize: number;
}

export interface ProvidersData {
  activeProviderId: string | null;
  providers: Record<string, Provider>;
}


export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  filePath: string;
  language?: string;
  hunks: DiffHunk[];
}
