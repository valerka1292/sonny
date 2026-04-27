const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');

// AskUserQuestion is a *user-interaction* tool. The model emits the call,
// the renderer intercepts it (similar to the rw-tool confirmation flow) and
// asks the human to pick one of the offered options (or type "Other").
// The result returned to the model is the user's selection(s).
//
// `execute()` here is a defensive fallback: if for any reason the renderer
// path is bypassed (e.g. an integration test without a UI), we simply echo
// the questions back as-is with no answers, instead of throwing — that
// keeps the tool error surface minimal in unusual environments. Production
// paths always resolve via the renderer's askQuestion callback.

const QUESTION_OPTION_SCHEMA = z.object({
  label: z
    .string()
    .min(1)
    .describe(
      'Display text for this option (1-5 words). What the user clicks. Keep it concise and unambiguous.',
    ),
  description: z
    .string()
    .min(1)
    .describe(
      'Plain explanation of what this option means or what happens if chosen. Use for trade-offs, implications, or context — the user will see it next to the label.',
    ),
});

const QUESTION_SCHEMA = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      'The complete question text. Should be specific and end with a question mark. If multiSelect is true, phrase accordingly (e.g. "Which features should we enable?").',
    ),
  header: z
    .string()
    .min(1)
    .max(12)
    .describe(
      'Very short label shown as a chip above the question (max 12 chars). Examples: "Library", "Auth", "Format".',
    ),
  options: z
    .array(QUESTION_OPTION_SCHEMA)
    .min(2)
    .max(4)
    .describe(
      '2-4 distinct options the user can pick from. Each option label MUST be unique within this question. Do NOT include an "Other" option — the UI offers a free-text input automatically.',
    ),
  multiSelect: z
    .boolean()
    .default(false)
    .describe(
      'When true, the user may pick more than one option. Use only when the choices are not mutually exclusive.',
    ),
});

// Plain object — no superRefine — so zod-to-json-schema produces a clean
// schema for the LLM. Uniqueness of question texts and per-question option
// labels is enforced at runtime in `execute()`; we surface a clear error
// the model can act on rather than letting it slip through and confuse the
// answers map.
const INPUT_SCHEMA = z.strictObject({
  questions: z
    .array(QUESTION_SCHEMA)
    .min(1)
    .max(4)
    .describe(
      '1-4 questions to ask the user. If you provide more than one, the user will answer them sequentially with a Continue button between each, and you receive all answers together as a single tool result. Question texts must be unique across the array, and option labels must be unique within each question.',
    ),
});

function validateUniqueness(input) {
  const seenQuestions = new Set();
  for (const q of input.questions) {
    if (seenQuestions.has(q.question)) {
      throw new Error(
        `Duplicate question text: "${q.question}". Each question's text must be unique because it's used as a key in the answers map.`,
      );
    }
    seenQuestions.add(q.question);

    const seenLabels = new Set();
    for (const opt of q.options) {
      if (seenLabels.has(opt.label)) {
        throw new Error(
          `Duplicate option label "${opt.label}" in question "${q.question}". Option labels must be unique within a question.`,
        );
      }
      seenLabels.add(opt.label);
    }
  }
}

const OUTPUT_SCHEMA = z.object({
  questions: z.array(QUESTION_SCHEMA),
  answers: z
    .record(z.string(), z.string())
    .describe(
      'Map of question text → answer string. For multi-select questions, the answer string is a comma-separated list of the labels the user picked (or their custom text).',
    ),
});

const DESCRIPTION = `Ask the user one or more multiple-choice questions to gather information, clarify ambiguity, or have them choose between approaches.

## When to Use This Tool

Use this tool when you have a *real* ambiguity that only the user can resolve and that affects what you'd do next. Typical cases:

1. **Clarifying ambiguous instructions.** "Add a calculator" — should it support floats? Decimal operations? Two answers, two very different implementations.
2. **Architecture / library choices that matter.** "Use date-fns or Day.js?" — pick one and stick with it; don't guess.
3. **Branching plans.** "I can fix this with a one-line guard, or restructure the function for safety. Which do you want?"
4. **Confirming a destructive direction.** "I'm about to delete \`legacy/*\`. Is that OK?" — but only when you genuinely need consent and not as a generic "should I continue?" stall.

## When NOT to Use This Tool

- **Don't use it as a stalling pattern.** "Should I continue?" / "Is this OK?" mid-loop is exactly what this tool is meant to *replace*, not enable. If you're not blocked on a real choice, just keep working.
- **Don't ask trivial yes/no when the answer is obvious from context.** Read the user's original prompt; commit to the natural reading.
- **Don't ask procedural questions.** Style, naming, file layout — follow the surrounding code.

## How the User Sees It

- Each question appears as a chip-labelled card with 2-4 options.
- The user can pick from the offered options OR type a custom answer in the "Other" field at the bottom.
- For \`multiSelect: true\`, options become checkboxes and the user can pick any subset.
- If you send multiple questions, they appear sequentially: the user answers question 1, presses Continue, answers question 2, etc. You receive all answers in a single tool result.

## Authoring Good Options

- Keep \`label\` short (1-5 words) and \`description\` to one explanatory sentence about what picking it means.
- Options must be distinct — don't pad the list with near-duplicates to hit the minimum of 2.
- Don't add a manual "Other" option; the UI provides a free-text input.
- If you have a recommendation, put it FIRST and add "(Recommended)" to the label.
- 1-4 questions per call, 2-4 options per question. Question texts and option labels (within the same question) must be unique.

## Result Format

You receive \`{ answers: { "<question text>": "<answer>" } }\`. For multi-select, the answer string is a comma-separated list of labels the user picked. For "Other" responses the answer is the user's typed text verbatim.`;

class AskUserQuestionTool extends Tool {
  constructor() {
    super();
    this.name = 'AskUserQuestion';
    this.description = DESCRIPTION;
    this.mode = 'ro';
    this.category = 'system';
    this.inputSchema = INPUT_SCHEMA;
    this.outputSchema = OUTPUT_SCHEMA;
  }

  async execute(input) {
    validateUniqueness(input);
    return {
      questions: input.questions,
      answers: {},
    };
  }
}

const tool = new AskUserQuestionTool();
registry.register(tool);

module.exports = { AskUserQuestionTool, tool };
