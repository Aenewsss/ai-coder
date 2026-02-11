import { JobData } from '../../src/jobs/queue.js';

// Test payload builders
export function createTestJobData(overrides?: Partial<JobData>): JobData {
  return {
    task: {
      description: 'Test task: Add a README file',
      priority: 'normal',
      ...overrides?.task,
    },
    organization: {
      id: 'test-org-123',
      name: 'Test Organization',
      installationId: 12345678,
      ...overrides?.organization,
    },
    repository: {
      owner: 'test-owner',
      name: 'test-repo',
      defaultBranch: 'main',
      ...overrides?.repository,
    },
    callback: overrides?.callback,
  };
}

export function createWebhookPayload(overrides?: Partial<JobData>) {
  return createTestJobData(overrides);
}

// Progress validation helpers
export function validateProgressSequence(
  progressUpdates: Array<{ percentage: number; turn?: number; maxTurns?: number }>
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check that progress is monotonically increasing
  for (let i = 1; i < progressUpdates.length; i++) {
    if (progressUpdates[i].percentage < progressUpdates[i - 1].percentage) {
      errors.push(
        `Progress decreased from ${progressUpdates[i - 1].percentage}% to ${progressUpdates[i].percentage}%`
      );
    }
  }

  // Check expected milestones based on processor.ts
  const percentages = progressUpdates.map(p => p.percentage);

  // Should have 10% (workspace created)
  if (!percentages.includes(10)) {
    errors.push('Missing 10% progress update (workspace creation)');
  }

  // Should have 20% (agent loop starting)
  if (!percentages.includes(20)) {
    errors.push('Missing 20% progress update (agent loop start)');
  }

  // Should have 90% (before final completion)
  if (!percentages.includes(90)) {
    errors.push('Missing 90% progress update (before completion)');
  }

  // Should reach 100%
  if (!percentages.includes(100)) {
    errors.push('Missing 100% progress update (completion)');
  }

  // Check that turn information is present during agent loop (20-90%)
  const agentLoopUpdates = progressUpdates.filter(
    p => p.percentage > 20 && p.percentage < 90
  );

  if (agentLoopUpdates.length > 0) {
    const hasTurnInfo = agentLoopUpdates.some(p => p.turn !== undefined && p.maxTurns !== undefined);
    if (!hasTurnInfo) {
      errors.push('Agent loop progress updates missing turn information');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Timing helpers
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 10000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await sleep(checkIntervalMs);
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

// Job state helpers
export const JobStates = {
  WAITING: 'waiting',
  DELAYED: 'delayed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobState = typeof JobStates[keyof typeof JobStates];
