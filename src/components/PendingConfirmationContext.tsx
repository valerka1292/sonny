import { createContext, useContext } from 'react';
import type { ToolCall } from '../types';

export interface PendingConfirmation {
  toolCall: ToolCall;
  output: unknown;
}

export interface PendingConfirmationContextValue {
  pendingConfirmation: PendingConfirmation | null;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export const PendingConfirmationContext = createContext<PendingConfirmationContextValue | null>(null);

/**
 * Reads pending-confirmation state from MessageList. Returns null when there's
 * no provider in the tree (e.g. unit tests) so call-sites can render without
 * action buttons.
 */
export function usePendingConfirmation(): PendingConfirmationContextValue | null {
  return useContext(PendingConfirmationContext);
}
