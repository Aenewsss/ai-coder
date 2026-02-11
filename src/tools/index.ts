import { Workspace } from '../sandbox/workspace.js';
import { toolDefinitions } from './definitions/github.js';
import {
  handleSearchCode,
  handleListDirectory,
  handleReadFile,
  handleWriteFile,
  handleEditFile,
  handleDeleteFile,
  handleRunCommand,
  SearchCodeInput,
  ListDirectoryInput,
  ReadFileInput,
  WriteFileInput,
  EditFileInput,
  DeleteFileInput,
  RunCommandInput,
} from './handlers/files.handler.js';
import {
  handleCreateBranch,
  handleCommitChanges,
  handleGetGitStatus,
  handleCreatePullRequest,
  handleTaskComplete,
  CreateBranchInput,
  CommitChangesInput,
  CreatePullRequestInput,
  TaskCompleteInput,
} from './handlers/git.handler.js';
import { logger } from '../utils/logger.js';

export { toolDefinitions };

export type ToolResult =
  | string
  | { complete: true; summary: string; pullRequestUrl?: string };

export async function executeTool(
  workspace: Workspace,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolResult> {
  logger.debug({ toolName, toolInput }, 'Executing tool');

  switch (toolName) {
    case 'search_code':
      return handleSearchCode(workspace, toolInput as unknown as SearchCodeInput);

    case 'list_directory':
      return handleListDirectory(workspace, toolInput as unknown as ListDirectoryInput);

    case 'read_file':
      return handleReadFile(workspace, toolInput as unknown as ReadFileInput);

    case 'write_file':
      return handleWriteFile(workspace, toolInput as unknown as WriteFileInput);

    case 'edit_file':
      return handleEditFile(workspace, toolInput as unknown as EditFileInput);

    case 'delete_file':
      return handleDeleteFile(workspace, toolInput as unknown as DeleteFileInput);

    case 'create_branch':
      return handleCreateBranch(workspace, toolInput as unknown as CreateBranchInput);

    case 'commit_changes':
      return handleCommitChanges(workspace, toolInput as unknown as CommitChangesInput);

    case 'get_git_status':
      return handleGetGitStatus(workspace);

    case 'create_pull_request':
      return handleCreatePullRequest(workspace, toolInput as unknown as CreatePullRequestInput);

    case 'run_command':
      return handleRunCommand(workspace, toolInput as unknown as RunCommandInput);

    case 'task_complete':
      return handleTaskComplete(workspace, toolInput as unknown as TaskCompleteInput);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
