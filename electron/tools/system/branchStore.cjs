const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const BRANCHES = ['agent', 'user'];
const DEFAULT_BRANCH = 'agent';
const branchStatePath = path.join(os.homedir(), '.sonny', 'branch.json');

function normalizeBranch(value) {
  return BRANCHES.includes(value) ? value : DEFAULT_BRANCH;
}

async function ensureDir(dirPath) {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

async function atomicWriteFile(targetPath, content) {
  const tmpPath = `${targetPath}.tmp`;
  try {
    await ensureDir(path.dirname(targetPath));
    await fsPromises.writeFile(tmpPath, content, 'utf-8');
    await fsPromises.rename(tmpPath, targetPath);
  } catch (error) {
    await fsPromises.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

async function readCurrentBranch() {
  try {
    const raw = await fsPromises.readFile(branchStatePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return normalizeBranch(parsed?.currentBranch);
  } catch {
    return DEFAULT_BRANCH;
  }
}

async function writeCurrentBranch(branch) {
  const currentBranch = normalizeBranch(branch);
  await atomicWriteFile(branchStatePath, JSON.stringify({ currentBranch }, null, 2));
  return currentBranch;
}

function branchPathFor(sandboxPath, branch) {
  return path.join(sandboxPath, normalizeBranch(branch));
}

async function ensureBranchLayout(sandboxPath) {
  await ensureDir(sandboxPath);
  await Promise.all(BRANCHES.map(branch => ensureDir(branchPathFor(sandboxPath, branch))));
}

async function listBranchProjects(sandboxPath, branch) {
  const branchPath = branchPathFor(sandboxPath, branch);
  await ensureDir(branchPath);
  const entries = await fsPromises.readdir(branchPath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

module.exports = {
  BRANCHES,
  DEFAULT_BRANCH,
  branchPathFor,
  ensureBranchLayout,
  listBranchProjects,
  normalizeBranch,
  readCurrentBranch,
  writeCurrentBranch,
};
