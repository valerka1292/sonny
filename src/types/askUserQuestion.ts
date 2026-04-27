// Shared shape for the AskUserQuestion tool. The Node side validates these
// with Zod (electron/tools/system/AskUserQuestionTool.cjs); on the renderer
// side we only consume them, so a structural type is enough.

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestion {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  /** Default false. Renders checkboxes instead of radios when true. */
  multiSelect?: boolean;
}

/**
 * Map of question-text → answer-string. For multi-select questions the
 * answer string is a comma-separated list of labels (or the user's "Other"
 * text). Mirrors the tool's output schema exactly.
 */
export type AskUserQuestionAnswers = Record<string, string>;

/** Tool input shape — only `questions` is meaningful to the renderer. */
export interface AskUserQuestionInput {
  questions: AskUserQuestion[];
}

/** Tool output shape — what the runner pushes back into the LLM history. */
export interface AskUserQuestionOutput {
  questions: AskUserQuestion[];
  answers: AskUserQuestionAnswers;
}
