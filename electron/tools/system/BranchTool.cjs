const { Tool } = require('../Tool.cjs');
const { registry } = require('../registry.cjs');
const { z } = require('zod');
const {
  BRANCHES,
  branchPathFor,
  ensureBranchLayout,
  listBranchProjects,
  writeCurrentBranch,
} = require('./branchStore.cjs');

class BranchTool extends Tool {
  constructor() {
    super();
    this.name = 'Branch';
    this.description = `Switch the active sandbox branch.

Branches:
- agent — Sonny's autonomous pet projects and self-directed experiments.
- user — projects requested by the user.

Use this before filesystem work when the current branch does not match the task owner. User-requested projects belong in user. Self-directed autonomous projects belong in agent.`;
    this.mode = 'ro';
    this.category = 'system';

    this.inputSchema = z.strictObject({
      branch: z.enum(BRANCHES).describe('Branch to switch to: agent or user.'),
      apply: z.boolean().optional().describe('Internal flag. Ignored; Branch switches immediately.'),
    });

    this.outputSchema = z.object({
      currentBranch: z.enum(BRANCHES),
      workingDirectory: z.string(),
      projects: z.array(z.string()),
    });
  }

  async execute(input, context) {
    await ensureBranchLayout(context.sandboxRoot);
    const currentBranch = await writeCurrentBranch(input.branch);
    const workingDirectory = branchPathFor(context.sandboxRoot, currentBranch);
    const projects = await listBranchProjects(context.sandboxRoot, currentBranch);

    return {
      currentBranch,
      workingDirectory,
      projects,
    };
  }
}

const tool = new BranchTool();
registry.register(tool);

module.exports = { BranchTool: tool };
