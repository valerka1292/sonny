import { z } from 'zod';

export const toolCallSchema = z.object({
  index: z.number().int(),
  id: z.string().optional(),
  function: z
    .object({
      name: z.string().optional(),
      arguments: z.string().optional(),
    })
    .optional(),
  result: z
    .object({
      status: z.enum(['running', 'success', 'error']),
      error: z.string().optional(),
      output: z.unknown().optional(),
    })
    .optional(),
});

export const storedMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number().int(),
  thinking: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional(),
});

export const llmHistorySchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.unknown()).optional(),
});

export const chatDataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  messages: z.array(storedMessageSchema),
  llmHistory: z.array(llmHistorySchema),
  contextTokensUsed: z.number().nonnegative(),
});
