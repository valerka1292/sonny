const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const { readTodos, writeTodos } = require('./todoStore.cjs');

const todoItemSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty'),
  activeForm: z.string().min(1, 'Active form cannot be empty'),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const todoListSchema = z.array(todoItemSchema);

const DESCRIPTION = `Use this tool to create and manage a structured task list for your current session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user. It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos
6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

## Task States and Management

1. **Task States**:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully

   Each task must include:
   - content: The imperative form describing what needs to be done (e.g., "Run tests")
   - activeForm: The present continuous form shown during execution (e.g., "Running tests")
   - status: one of pending | in_progress | completed

2. **Task Management**:
   - Replace the entire list on every call. Omitting an item removes it.
   - Update task status in real-time as you work.
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions).
   - Exactly ONE task should be in_progress at any time when actively working.
   - To clear the list entirely, call this tool with todos: []. When all current todos are marked completed in a single call, the list is also auto-cleared so you can start fresh next turn.

3. **Task Completion Requirements**:
   - ONLY mark a task as completed when you have FULLY accomplished it.
   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress.

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.`;

class TodoWriteTool extends Tool {
  constructor() {
    super();
    this.name = 'TodoWrite';
    this.description = DESCRIPTION;
    // Read-only with respect to the user's filesystem — no preview / approval
    // round-trip needed. The tool just rewrites session state.
    this.mode = 'ro';
    this.category = 'system';

    this.inputSchema = z.strictObject({
      todos: todoListSchema.describe('The full updated todo list. Replaces the previous list entirely.'),
    });

    this.outputSchema = z.object({
      oldTodos: todoListSchema,
      newTodos: todoListSchema,
      cleared: z.boolean(),
    });
  }

  async execute(input, context) {
    const chatId = context?.chatId;
    if (!chatId) {
      // No active chat → nowhere to persist. Treat as a no-op so the agent
      // doesn't get stuck retrying.
      return { oldTodos: [], newTodos: input.todos, cleared: false };
    }

    const oldTodos = await readTodos(chatId);

    // Mirror Claude Code's "all done = clear" convention so the next turn
    // starts with a fresh slate without the model having to send an empty
    // array.
    const allDone = input.todos.length > 0 && input.todos.every((t) => t.status === 'completed');
    const persisted = allDone ? [] : input.todos;

    await writeTodos(chatId, persisted);

    return {
      oldTodos,
      newTodos: input.todos,
      cleared: allDone,
    };
  }
}

const tool = new TodoWriteTool();
registry.register(tool);

module.exports = { TodoWriteTool, tool };
