import { exec } from 'child_process';
import { promisify } from 'util';
import {
  Workspace,
  listDirectory,
  readFileContent,
  writeFileContent,
  deleteFile,
} from '../../sandbox/workspace.js';
import { WorkspaceError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

export interface SearchCodeInput {
  pattern: string;
  file_pattern?: string;
  case_sensitive?: boolean;
}

export interface ListDirectoryInput {
  path: string;
}

export interface ReadFileInput {
  path: string;
}

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface EditFileInput {
  path: string;
  old_text: string;
  new_text: string;
}

export interface DeleteFileInput {
  path: string;
}

export interface RunCommandInput {
  command: string;
  timeout_seconds?: number;
}

// Blocked command patterns for security
const BLOCKED_COMMANDS = [
  /^rm\s+-rf\s+[\/~]/i,
  /^rm\s+-rf\s*$/i,
  /^curl\s+.*\|\s*(bash|sh)/i,
  /^wget\s+.*\|\s*(bash|sh)/i,
  /\bsudo\b/i,
  /\bsu\s/i,
  /^chmod\s+777/i,
  /^chmod\s+\+s/i,
  />\s*\/etc\//i,
  />\s*\/dev\//i,
  /\bdd\s+.*if=/i,
  /\bmkfs/i,
  /\bfdisk/i,
  /\bparted/i,
  /\biptables/i,
  /\bufw/i,
  /\bsystemctl/i,
  /\breboot/i,
  /\bshutdown/i,
  /\binit\s/i,
];

export async function handleSearchCode(
  workspace: Workspace,
  input: SearchCodeInput
): Promise<string> {
  const { pattern, file_pattern, case_sensitive } = input;

  try {
    const grepArgs = [
      '-r',
      '-n',
      '--include', file_pattern || '*',
      case_sensitive ? '' : '-i',
      pattern,
      '.',
    ].filter(Boolean);

    const { stdout, stderr } = await execAsync(`grep ${grepArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
      cwd: workspace.path,
      maxBuffer: 1024 * 1024, // 1MB
      timeout: 30000,
    });

    if (!stdout.trim()) {
      return 'No matches found.';
    }

    // Limit output to first 100 lines
    const lines = stdout.trim().split('\n');
    const truncated = lines.length > 100;
    const result = lines.slice(0, 100).join('\n');

    return truncated
      ? `${result}\n\n... (${lines.length - 100} more matches truncated)`
      : result;
  } catch (error: unknown) {
    const execError = error as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
    // grep returns exit code 1 when no matches found
    if (execError.code === 1 && !execError.stderr) {
      return 'No matches found.';
    }
    if (execError.killed) {
      return 'Search timed out. Try a more specific pattern.';
    }
    throw new WorkspaceError(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function handleListDirectory(
  workspace: Workspace,
  input: ListDirectoryInput
): Promise<string> {
  const entries = await listDirectory(workspace, input.path);
  if (entries.length === 0) {
    return 'Directory is empty.';
  }
  return entries.join('\n');
}

export async function handleReadFile(
  workspace: Workspace,
  input: ReadFileInput
): Promise<string> {
  const content = await readFileContent(workspace, input.path);

  // Add line numbers
  const lines = content.split('\n');
  const numbered = lines.map((line, i) => `${String(i + 1).padStart(4)}: ${line}`).join('\n');

  // Truncate very large files
  if (numbered.length > 50000) {
    return `${numbered.slice(0, 50000)}\n\n... (file truncated, ${lines.length} total lines)`;
  }

  return numbered;
}

export async function handleWriteFile(
  workspace: Workspace,
  input: WriteFileInput
): Promise<string> {
  await writeFileContent(workspace, input.path, input.content);
  return `Successfully wrote to ${input.path}`;
}

export async function handleEditFile(
  workspace: Workspace,
  input: EditFileInput
): Promise<string> {
  const { path, old_text, new_text } = input;

  const content = await readFileContent(workspace, path);

  if (!content.includes(old_text)) {
    throw new WorkspaceError(`Could not find the specified text in ${path}. Make sure old_text matches exactly.`, {
      path,
      old_text: old_text.slice(0, 100),
    });
  }

  // Count occurrences
  const occurrences = content.split(old_text).length - 1;
  if (occurrences > 1) {
    throw new WorkspaceError(
      `Found ${occurrences} occurrences of old_text in ${path}. Please provide more context to make the match unique.`,
      { path, occurrences }
    );
  }

  const newContent = content.replace(old_text, new_text);
  await writeFileContent(workspace, path, newContent);

  return `Successfully edited ${path}`;
}

export async function handleDeleteFile(
  workspace: Workspace,
  input: DeleteFileInput
): Promise<string> {
  await deleteFile(workspace, input.path);
  return `Successfully deleted ${input.path}`;
}

export async function handleRunCommand(
  workspace: Workspace,
  input: RunCommandInput
): Promise<string> {
  const { command, timeout_seconds = 60 } = input;
  const timeout = Math.min(timeout_seconds, 300) * 1000;

  // Check for blocked commands
  for (const blocked of BLOCKED_COMMANDS) {
    if (blocked.test(command)) {
      throw new WorkspaceError('This command is not allowed for security reasons.', { command });
    }
  }

  logger.debug({ workspaceId: workspace.id, command }, 'Running command');

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspace.path,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      env: {
        ...process.env,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      },
    });

    let result = '';
    if (stdout.trim()) {
      result += `STDOUT:\n${stdout.trim()}`;
    }
    if (stderr.trim()) {
      if (result) result += '\n\n';
      result += `STDERR:\n${stderr.trim()}`;
    }

    return result || 'Command completed successfully with no output.';
  } catch (error: unknown) {
    const execError = error as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
    if (execError.killed) {
      return `Command timed out after ${timeout_seconds} seconds.`;
    }

    let result = `Command failed with exit code ${execError.code || 'unknown'}.`;
    if (execError.stdout) {
      result += `\n\nSTDOUT:\n${execError.stdout}`;
    }
    if (execError.stderr) {
      result += `\n\nSTDERR:\n${execError.stderr}`;
    }

    return result;
  }
}
