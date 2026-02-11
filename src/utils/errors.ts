export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class GitHubError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GITHUB_ERROR', 500, details);
    this.name = 'GitHubError';
  }
}

export class AgentError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', 500, details);
    this.name = 'AgentError';
  }
}

export class WorkspaceError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKSPACE_ERROR', 500, details);
    this.name = 'WorkspaceError';
  }
}

export class JobError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'JOB_ERROR', 500, details);
    this.name = 'JobError';
  }
}
