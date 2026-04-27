import { useMemo, useState } from 'react';
import { Check, HelpCircle, X } from 'lucide-react';
import type { ToolRendererProps } from '../../types';
import type {
  AskUserQuestion,
  AskUserQuestionAnswers,
  AskUserQuestionInput,
  AskUserQuestionOutput,
} from '../../types/askUserQuestion';
import { usePendingQuestion } from '../PendingQuestionContext';

/**
 * Tool renderer for AskUserQuestion.
 *
 * Two modes:
 *   1) Interactive (this tool call is the current pending question) —
 *      shows a sequential single-question form with options + "Other"
 *      free-text. After answering all questions, dispatches a single
 *      submit to the resolver.
 *   2) Result summary (the tool call already has a `result.output.answers`)
 *      — shows the question text and what the user answered.
 *
 * The model never sees the rendered UI; what it gets back is the
 * `answers` map, formatted by the runner into a tool result.
 */
export default function AskUserQuestionRenderer({ toolCall }: ToolRendererProps) {
  const ctx = usePendingQuestion();
  const isPending =
    ctx?.pendingQuestion?.toolCall.id !== undefined &&
    toolCall.id !== undefined &&
    ctx.pendingQuestion.toolCall.id === toolCall.id;

  const status = toolCall.result?.status;
  const error = toolCall.result?.error;

  // Result/summary view — the user already answered (success path) or the
  // call errored / was declined.
  if (!isPending) {
    if (status === 'success') {
      const output = toolCall.result?.output as AskUserQuestionOutput | undefined;
      const answers = output?.answers ?? {};
      const questions = output?.questions ?? [];
      return <AnsweredSummary questions={questions} answers={answers} />;
    }
    if (status === 'error') {
      const isDeclined = typeof error === 'string' && /declin|stop|reject/i.test(error);
      return (
        <div
          className={`my-2 rounded-lg border ${isDeclined ? 'border-border' : 'border-red-900/60'} bg-bg-2 px-3 py-2 text-xs ${isDeclined ? 'text-text-secondary' : 'text-red-400'}`}
        >
          <span className="inline-flex items-center gap-1.5">
            {isDeclined ? <X size={12} /> : <HelpCircle size={12} />}
            <span>{isDeclined ? 'Question declined' : `Question failed: ${error ?? 'unknown error'}`}</span>
          </span>
        </div>
      );
    }
    // Streaming or running but not pending in the resolver context (e.g.
    // user is on a different chat). Show a minimal placeholder so the card
    // doesn't sit blank.
    return (
      <div className="my-2 rounded-lg border border-border bg-bg-2 px-3 py-2 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <HelpCircle size={12} />
          <span>Waiting for question to be asked…</span>
        </span>
      </div>
    );
  }

  // Interactive form — this is the live one.
  const input = parseInput(toolCall.function?.arguments);
  if (!input || input.questions.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-red-900/60 bg-bg-2 px-3 py-2 text-xs text-red-400">
        AskUserQuestion: invalid arguments
      </div>
    );
  }

  return (
    <InteractiveAskQuestion
      questions={input.questions}
      onSubmit={(answers) => ctx?.onSubmit(answers)}
      onDecline={() => ctx?.onDecline()}
    />
  );
}

function parseInput(rawArgs: string | undefined): AskUserQuestionInput | null {
  if (!rawArgs) return null;
  try {
    const parsed = JSON.parse(rawArgs);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.questions)) {
      return null;
    }
    return parsed as AskUserQuestionInput;
  } catch {
    return null;
  }
}

interface InteractiveAskQuestionProps {
  questions: AskUserQuestion[];
  onSubmit: (answers: AskUserQuestionAnswers) => void;
  onDecline: () => void;
}

function InteractiveAskQuestion({ questions, onSubmit, onDecline }: InteractiveAskQuestionProps) {
  // We surface ONE question at a time in the order the model sent them.
  // The user clicks Continue to advance; on the last question Continue is
  // labeled Send and submits the whole answer set.
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AskUserQuestionAnswers>({});

  const current = questions[index];
  const isLast = index === questions.length - 1;
  const total = questions.length;

  const handleAnswered = (answer: string) => {
    const nextAnswers: AskUserQuestionAnswers = { ...answers, [current.question]: answer };
    if (isLast) {
      onSubmit(nextAnswers);
    } else {
      setAnswers(nextAnswers);
      setIndex(index + 1);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="px-3 py-2 bg-bg-3/30 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-400 font-mono">
            {current.header}
          </span>
          {total > 1 && (
            <span className="text-text-secondary/80">
              Question {index + 1} of {total}
            </span>
          )}
        </div>
        <button
          onClick={onDecline}
          className="text-xs text-text-secondary hover:text-red-400 px-2 py-0.5 rounded"
          title="Skip these questions"
        >
          Decline
        </button>
      </div>
      <SingleQuestionForm
        key={current.question}
        question={current}
        submitLabel={isLast ? 'Send' : 'Continue'}
        onSubmit={handleAnswered}
      />
    </div>
  );
}

interface SingleQuestionFormProps {
  question: AskUserQuestion;
  submitLabel: string;
  onSubmit: (answer: string) => void;
}

function SingleQuestionForm({ question, submitLabel, onSubmit }: SingleQuestionFormProps) {
  const isMulti = question.multiSelect === true;
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [otherFocused, setOtherFocused] = useState(false);

  const toggleLabel = (label: string) => {
    if (isMulti) {
      setSelectedLabels((prev) =>
        prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
      );
    } else {
      setSelectedLabels([label]);
      setOtherText('');
    }
  };

  const canSubmit = useMemo(() => {
    if (otherText.trim().length > 0) return true;
    return selectedLabels.length > 0;
  }, [selectedLabels, otherText]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (otherText.trim().length > 0) {
      // "Other" wins over the selected options (if any). Send raw text.
      onSubmit(otherText.trim());
      return;
    }
    onSubmit(selectedLabels.join(', '));
  };

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
      <div className="text-sm text-text-primary leading-relaxed">{question.question}</div>
      <div className="flex flex-col gap-1.5">
        {question.options.map((opt) => {
          const isSelected = selectedLabels.includes(opt.label);
          return (
            <button
              key={opt.label}
              onClick={() => toggleLabel(opt.label)}
              className={`group flex items-start gap-2 rounded border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-blue-500/60 bg-blue-500/10'
                  : 'border-border bg-bg-1 hover:bg-bg-3/50'
              }`}
            >
              <div
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center ${isMulti ? 'rounded-sm' : 'rounded-full'} border ${
                  isSelected ? 'border-blue-400 bg-blue-500/30' : 'border-border bg-bg-2'
                }`}
              >
                {isSelected && <Check size={10} className="text-blue-300" />}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm text-text-primary">{opt.label}</span>
                <span className="text-xs text-text-secondary leading-snug">{opt.description}</span>
              </div>
            </button>
          );
        })}
        <div
          className={`mt-1 rounded border px-3 py-2 transition-colors ${
            otherFocused || otherText.length > 0
              ? 'border-blue-500/60 bg-blue-500/5'
              : 'border-border bg-bg-1'
          }`}
        >
          <label className="block text-xs text-text-secondary mb-1">Other</label>
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onFocus={() => setOtherFocused(true)}
            onBlur={() => setOtherFocused(false)}
            placeholder="Type your own answer…"
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
          />
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded bg-white px-4 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:bg-bg-3 disabled:text-text-secondary"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

interface AnsweredSummaryProps {
  questions: AskUserQuestion[];
  answers: AskUserQuestionAnswers;
}

function AnsweredSummary({ questions, answers }: AnsweredSummaryProps) {
  const entries = Object.entries(answers);
  if (entries.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-border bg-bg-2 px-3 py-2 text-xs text-text-secondary">
        No answers recorded.
      </div>
    );
  }
  return (
    <div className="my-2 rounded-lg border border-border bg-bg-2 overflow-hidden max-w-full">
      <div className="px-3 py-2 bg-bg-3/30 border-b border-border flex items-center gap-2 text-xs text-text-secondary">
        <HelpCircle size={12} />
        <span>You answered {entries.length} question{entries.length === 1 ? '' : 's'}</span>
      </div>
      <div className="px-3 py-2 flex flex-col gap-2">
        {entries.map(([questionText, answer]) => {
          const q = questions.find((qq) => qq.question === questionText);
          return (
            <div key={questionText} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                {q?.header && (
                  <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400 font-mono">
                    {q.header}
                  </span>
                )}
                <span className="truncate">{questionText}</span>
              </div>
              <div className="text-sm text-text-primary pl-1">→ {answer}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
