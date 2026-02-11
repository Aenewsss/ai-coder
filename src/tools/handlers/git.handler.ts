import {
  Workspace,
  createBranch,
  commitChanges,
  pushBranch,
  getCurrentBranch,
  getStatus,
} from '../../sandbox/workspace.js';
import { getInstallationOctokit } from '../../github/installation.js';
import { GitHubError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface CreateBranchInput {
  branch_name: string;
}

export interface CommitChangesInput {
  message: string;
  files?: string[];
}

export interface CreatePullRequestInput {
  title: string;
  body: string;
}

export interface TaskCompleteInput {
  summary: string;
  pull_request_url?: string;
}

export async function handleCreateBranch(
  workspace: Workspace,
  input: CreateBranchInput
): Promise<string> {
  await createBranch(workspace, input.branch_name);
  return `Created and checked out branch: ${input.branch_name}`;
}

export async function handleCommitChanges(
  workspace: Workspace,
  input: CommitChangesInput
): Promise<string> {
  const commitHash = await commitChanges(workspace, input.message, input.files);
  return `Committed changes with hash: ${commitHash}`;
}

export async function handleGetGitStatus(workspace: Workspace): Promise<string> {
  const status = await getStatus(workspace);
  const currentBranch = await getCurrentBranch(workspace);

  const lines = [`Current branch: ${currentBranch}`, ''];

  if (status.staged.length > 0) {
    lines.push('Staged files:');
    status.staged.forEach((f) => lines.push(`  + ${f}`));
    lines.push('');
  }

  if (status.modified.length > 0) {
    lines.push('Modified files:');
    status.modified.forEach((f) => lines.push(`  M ${f}`));
    lines.push('');
  }

  if (status.created.length > 0) {
    lines.push('New files:');
    status.created.forEach((f) => lines.push(`  ? ${f}`));
    lines.push('');
  }

  if (status.deleted.length > 0) {
    lines.push('Deleted files:');
    status.deleted.forEach((f) => lines.push(`  D ${f}`));
    lines.push('');
  }

  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.created.length === 0 &&
    status.deleted.length === 0
  ) {
    lines.push('Working tree is clean.');
  }

  return lines.join('\n');
}

export async function handleCreatePullRequest(
  workspace: Workspace,
  input: CreatePullRequestInput
): Promise<string> {
  const { title, body } = input;
  const { owner, repo, defaultBranch, installationId } = workspace.config;

  // Get current branch
  const headBranch = await getCurrentBranch(workspace);

  if (headBranch === defaultBranch) {
    throw new GitHubError('Cannot create PR from the default branch. Create a new branch first.');
  }

  // Push the branch
  await pushBranch(workspace, headBranch);

  // Create the PR
  const octokit = await getInstallationOctokit(installationId);

  try {
    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: headBranch,
      base: defaultBranch,
    });

    logger.info(
      { workspaceId: workspace.id, prNumber: response.data.number, prUrl: response.data.html_url },
      'Created pull request'
    );

    return `Created pull request #${response.data.number}: ${response.data.html_url}`;
  } catch (error: unknown) {
    const apiError = error as { response?: { data?: { message?: string; errors?: Array<{ message: string }> } } };
    const message = apiError.response?.data?.message || (error instanceof Error ? error.message : String(error));
    const errors = apiError.response?.data?.errors?.map((e) => e.message).join(', ');

    throw new GitHubError(`Failed to create pull request: ${message}${errors ? ` (${errors})` : ''}`, {
      title,
      headBranch,
      baseBranch: defaultBranch,
    });
  }
}

export async function handleTaskComplete(
  _workspace: Workspace,
  input: TaskCompleteInput
): Promise<{ complete: true; summary: string; pullRequestUrl?: string }> {
  return {
    complete: true,
    summary: input.summary,
    pullRequestUrl: input.pull_request_url,
  };
}
