import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

export const toolDefinitions: Tool[] = [
  {
    name: 'search_code',
    description:
      'Search for code patterns in the repository using grep-like search. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The search pattern (supports regex)',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional glob pattern to filter files (e.g., "*.ts", "src/**/*.js")',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether search is case sensitive (default: false)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_directory',
    description:
      'List contents of a directory. Returns file and directory names. Directories end with "/".',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory relative to repository root (use "." for root)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to repository root',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create a new file or completely overwrite an existing file with new content. For surgical edits, use edit_file instead.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to repository root',
        },
        content: {
          type: 'string',
          description: 'The complete content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Make surgical edits to a file by replacing specific text. More precise than write_file for targeted changes.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to repository root',
        },
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace (must match exactly)',
        },
        new_text: {
          type: 'string',
          description: 'The text to replace it with',
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to repository root',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_branch',
    description: 'Create and checkout a new git branch from the current branch.',
    input_schema: {
      type: 'object',
      properties: {
        branch_name: {
          type: 'string',
          description: 'Name of the new branch (e.g., "feature/add-validation")',
        },
      },
      required: ['branch_name'],
    },
  },
  {
    name: 'commit_changes',
    description: 'Commit staged changes with a message. Stages all changes if no specific files provided.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The commit message',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific file paths to commit. If not provided, all changes are committed.',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'get_git_status',
    description: 'Get the current git status showing modified, created, deleted, and staged files.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_pull_request',
    description:
      'Push the current branch and create a pull request on GitHub. Call this after committing changes.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the pull request',
        },
        body: {
          type: 'string',
          description: 'The description/body of the pull request (supports markdown)',
        },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'run_command',
    description:
      'Execute a shell command in the repository directory. Use for running tests, linters, build commands, etc. Some dangerous commands are blocked.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Maximum time to wait for command (default: 60, max: 300)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'task_complete',
    description:
      'Signal that the task has been completed. Call this when you have finished all work and created a pull request.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A brief summary of what was accomplished',
        },
        pull_request_url: {
          type: 'string',
          description: 'The URL of the created pull request (if any)',
        },
      },
      required: ['summary'],
    },
  },
];
