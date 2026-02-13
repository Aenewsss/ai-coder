/**
 * Analyzes task complexity to determine which LLM model to use
 */

import { env } from '../config/env.js';

export type TaskComplexity = 'simple' | 'complex';

/**
 * Keywords that indicate a complex task requiring deeper reasoning
 */
const COMPLEX_TASK_INDICATORS = [
  // New features and architecture
  'implement', 'create feature', 'add feature', 'new feature',
  'architecture', 'refactor', 'redesign', 'rewrite',

  // Bug fixes and debugging
  'fix bug', 'debug', 'investigate', 'find issue', 'solve',
  'troubleshoot', 'diagnose',

  // Complex operations
  'optimize', 'performance', 'improve', 'enhance',
  'migrate', 'upgrade', 'integrate', 'connect',

  // Multi-step tasks
  'and', 'then', 'also', 'additionally',

  // Testing and validation
  'test', 'validate', 'verify', 'ensure',

  // Security and critical changes
  'security', 'authentication', 'authorization', 'permission',
  'database', 'api', 'endpoint', 'service',
];

/**
 * Keywords that indicate a simple task
 */
const SIMPLE_TASK_INDICATORS = [
  'typo', 'fix typo', 'correct typo',
  'update comment', 'add comment', 'fix comment',
  'update doc', 'fix doc', 'update readme',
  'rename', 'move file',
  'delete', 'remove unused',
  'format', 'lint', 'style',
  'update version', 'bump version',
];

/**
 * Analyzes a task description and returns its complexity level
 * @param taskDescription - The task description to analyze
 * @returns 'simple' or 'complex'
 */
export function analyzeTaskComplexity(taskDescription: string): TaskComplexity {
  const lowerDesc = taskDescription.toLowerCase();

  // Check for simple task indicators first (higher priority)
  const hasSimpleIndicator = SIMPLE_TASK_INDICATORS.some(
    indicator => lowerDesc.includes(indicator)
  );

  if (hasSimpleIndicator) {
    return 'simple';
  }

  // Check for complex task indicators
  const hasComplexIndicator = COMPLEX_TASK_INDICATORS.some(
    indicator => lowerDesc.includes(indicator)
  );

  if (hasComplexIndicator) {
    return 'complex';
  }

  // Default to complex for safety - better to use reasoner when uncertain
  return 'complex';
}

/**
 * Gets a human-readable explanation of why a task was classified
 * @param taskDescription - The task description
 * @param complexity - The determined complexity
 * @returns Explanation string
 */
export function getComplexityReason(
  taskDescription: string,
  complexity: TaskComplexity
): string {
  const lowerDesc = taskDescription.toLowerCase();

  if (complexity === 'simple') {
    const indicator = SIMPLE_TASK_INDICATORS.find(
      ind => lowerDesc.includes(ind)
    );
    return indicator
      ? `Task appears simple (contains: "${indicator}")`
      : 'Task classified as simple';
  }

  const indicator = COMPLEX_TASK_INDICATORS.find(
    ind => lowerDesc.includes(ind)
  );
  return indicator
    ? `Task requires complex reasoning (contains: "${indicator}")`
    : 'Task classified as complex (default for safety)';
}

/**
 * Selects the appropriate DeepSeek model based on task complexity
 * @param taskDescription - The task description to analyze
 * @returns Object with selected model and metadata
 */
export function selectDeepSeekModel(taskDescription: string): {
  model: string;
  complexity: TaskComplexity;
  reason: string;
  isDynamic: boolean;
} {
  // Check if dynamic model selection is enabled
  const isDynamic = env.DEEPSEEK_DYNAMIC_MODEL === 'true';

  if (!isDynamic) {
    // Use the default model from env
    return {
      model: env.DEEPSEEK_MODEL,
      complexity: 'complex', // Default assumption
      reason: 'Dynamic model selection is disabled',
      isDynamic: false,
    };
  }

  // Analyze task complexity
  const complexity = analyzeTaskComplexity(taskDescription);
  const reason = getComplexityReason(taskDescription, complexity);

  // Select model based on complexity
  const model = complexity === 'simple'
    ? env.DEEPSEEK_SIMPLE_MODEL
    : env.DEEPSEEK_COMPLEX_MODEL;

  return {
    model,
    complexity,
    reason,
    isDynamic: true,
  };
}
