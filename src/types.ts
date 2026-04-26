export type AgentMode = 'Chat' | 'Autonomy' | 'Improve' | 'Dream';

export interface ToolCallResult {
  status: 'running' | 'success' | 'error';
  error?: string;
  output?: any;
}

export interface ToolCall {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
  result?: ToolCallResult;
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
}

export interface ChatData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  llmHistory: { role: string; content: string; tool_call_id?: string; tool_calls?: any[] }[];
  contextTokensUsed: number;
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
