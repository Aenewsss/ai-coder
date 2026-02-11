import { simpleGit, SimpleGit } from 'simple-git';
import { mkdir, rm, readdir, stat, readFile, writeFile, unlink } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { existsSync } from 'fs';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { WorkspaceError } from '../utils/errors.js';
import { getInstallationToken } from '../github/installation.js';

export interface WorkspaceConfig {
  owner: string;
  repo: string;
  defaultBranch: string;
  installationId: number;
  jobId: string;
}

export interface Workspace {
  id: string;
  path: string;
  git: SimpleGit;
  config: WorkspaceConfig;
}

export async function createWorkspace(config: WorkspaceConfig): Promise<Workspace> {
  const id = nanoid(10);
  const workspacePath = join(env.WORKSPACE_BASE_PATH, config.jobId, id);

  try {
    await mkdir(workspacePath, { recursive: true });

    const token = await getInstallationToken(config.installationId);
    const cloneUrl = `https://x-access-token:${token}@github.com/${config.owner}/${config.repo}.git`;

    const git = simpleGit();
    await git.clone(cloneUrl, workspacePath, ['--depth', '1', '--branch', config.defaultBranch]);

    const repoGit = simpleGit(workspacePath);

    // Configure git user for commits
    await repoGit.addConfig('user.email', 'ai-coder@noreply.github.com');
    await repoGit.addConfig('user.name', 'AI Coder Bot');

    logger.info({ workspaceId: id, path: workspacePath }, 'Created workspace');

    return {
      id,
      path: workspacePath,
      git: repoGit,
      config,
    };
  } catch (error) {
    await cleanupWorkspace({ id, path: workspacePath, git: simpleGit(workspacePath), config });
    throw new WorkspaceError(`Failed to create workspace: ${error instanceof Error ? error.message : String(error)}`, {
      config,
    });
  }
}

export async function cleanupWorkspace(workspace: Workspace): Promise<void> {
  try {
    if (existsSync(workspace.path)) {
      await rm(workspace.path, { recursive: true, force: true });
      logger.info({ workspaceId: workspace.id }, 'Cleaned up workspace');
    }
  } catch (error) {
    logger.error({ workspaceId: workspace.id, error }, 'Failed to cleanup workspace');
  }
}

export async function cleanupJobWorkspaces(jobId: string): Promise<void> {
  const jobPath = join(env.WORKSPACE_BASE_PATH, jobId);
  try {
    if (existsSync(jobPath)) {
      await rm(jobPath, { recursive: true, force: true });
      logger.info({ jobId }, 'Cleaned up job workspaces');
    }
  } catch (error) {
    logger.error({ jobId, error }, 'Failed to cleanup job workspaces');
  }
}

// File operations
export async function listDirectory(workspace: Workspace, dirPath: string): Promise<string[]> {
  const fullPath = join(workspace.path, dirPath);
  validatePath(workspace, fullPath);

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
  } catch (error) {
    throw new WorkspaceError(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`, {
      path: dirPath,
    });
  }
}

export async function readFileContent(workspace: Workspace, filePath: string): Promise<string> {
  const fullPath = join(workspace.path, filePath);
  validatePath(workspace, fullPath);

  try {
    return await readFile(fullPath, 'utf-8');
  } catch (error) {
    throw new WorkspaceError(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`, {
      path: filePath,
    });
  }
}

export async function writeFileContent(
  workspace: Workspace,
  filePath: string,
  content: string
): Promise<void> {
  const fullPath = join(workspace.path, filePath);
  validatePath(workspace, fullPath);

  try {
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  } catch (error) {
    throw new WorkspaceError(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`, {
      path: filePath,
    });
  }
}

export async function deleteFile(workspace: Workspace, filePath: string): Promise<void> {
  const fullPath = join(workspace.path, filePath);
  validatePath(workspace, fullPath);

  try {
    await unlink(fullPath);
  } catch (error) {
    throw new WorkspaceError(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`, {
      path: filePath,
    });
  }
}

export async function fileExists(workspace: Workspace, filePath: string): Promise<boolean> {
  const fullPath = join(workspace.path, filePath);
  validatePath(workspace, fullPath);
  return existsSync(fullPath);
}

export async function getFileStats(
  workspace: Workspace,
  filePath: string
): Promise<{ isFile: boolean; isDirectory: boolean; size: number }> {
  const fullPath = join(workspace.path, filePath);
  validatePath(workspace, fullPath);

  const stats = await stat(fullPath);
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    size: stats.size,
  };
}

// Git operations
export async function createBranch(workspace: Workspace, branchName: string): Promise<void> {
  try {
    await workspace.git.checkoutLocalBranch(branchName);
    logger.debug({ workspaceId: workspace.id, branch: branchName }, 'Created branch');
  } catch (error) {
    throw new WorkspaceError(`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`, {
      branch: branchName,
    });
  }
}

export async function commitChanges(
  workspace: Workspace,
  message: string,
  files?: string[]
): Promise<string> {
  try {
    if (files && files.length > 0) {
      await workspace.git.add(files);
    } else {
      await workspace.git.add('-A');
    }

    const result = await workspace.git.commit(message);
    logger.debug({ workspaceId: workspace.id, commit: result.commit }, 'Committed changes');
    return result.commit;
  } catch (error) {
    throw new WorkspaceError(`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`, {
      message,
    });
  }
}

export async function pushBranch(workspace: Workspace, branchName: string): Promise<void> {
  try {
    const token = await getInstallationToken(workspace.config.installationId);
    const pushUrl = `https://x-access-token:${token}@github.com/${workspace.config.owner}/${workspace.config.repo}.git`;

    await workspace.git.push(pushUrl, branchName, ['--set-upstream']);
    logger.debug({ workspaceId: workspace.id, branch: branchName }, 'Pushed branch');
  } catch (error) {
    throw new WorkspaceError(`Failed to push branch: ${error instanceof Error ? error.message : String(error)}`, {
      branch: branchName,
    });
  }
}

export async function getCurrentBranch(workspace: Workspace): Promise<string> {
  const result = await workspace.git.branch();
  return result.current;
}

export async function getStatus(workspace: Workspace): Promise<{
  modified: string[];
  created: string[];
  deleted: string[];
  staged: string[];
}> {
  const status = await workspace.git.status();
  return {
    modified: status.modified,
    created: status.created,
    deleted: status.deleted,
    staged: status.staged,
  };
}

// Security: Prevent path traversal
function validatePath(workspace: Workspace, fullPath: string): void {
  const relativePath = relative(workspace.path, fullPath);
  if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
    throw new WorkspaceError('Path traversal detected', { path: fullPath });
  }
}
