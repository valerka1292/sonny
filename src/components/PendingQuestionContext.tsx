import { createContext, useContext } from 'react';
import type { ToolCall } from '../types';
import type { AskUserQuestion, AskUserQuestionAnswers } from '../types/askUserQuestion';

export interface PendingQuestion {
  toolCall: ToolCall;
  questions: AskUserQuestion[];
}

export interface PendingQuestionContextValue {
  pendingQuestion: PendingQuestion | null;
  /**
   * Submit answers for the current pending question. The answers map is
   * keyed by question text (the same string the model emitted) so the
   * runner can re-key it to the model's expectations without ambiguity.
   */
  onSubmit: (answers: AskUserQuestionAnswers) => void;
  /**
   * User explicitly declined to answer. Treated as a tool error on the
   * runner side so the model gets a clear signal instead of a hang.
   */
  onDecline: () => void;
}

export const PendingQuestionContext = createContext<PendingQuestionContextValue | null>(null);

/**
 * Reads pending-question state from the message list. Returns null when
 * no provider is in the tree so renderers can degrade to a passive view
 * (used in the result-summary path once answers exist on the tool call).
 */
export function usePendingQuestion(): PendingQuestionContextValue | null {
  return useContext(PendingQuestionContext);
}
