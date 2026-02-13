import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkpointManager } from '../../src/agent/checkpoint.js';
import { Message } from '../../src/llm/types.js';

describe('Checkpoint System E2E', () => {
  const testJobId = 'test-checkpoint-job-' + Date.now();
  const testWorkspaceId = 'test-workspace-123';

  afterEach(async () => {
    // Cleanup
    await checkpointManager.deleteCheckpoint(testJobId);
  });

  describe('Checkpoint Creation and Loading', () => {
    it('should save and load a checkpoint successfully', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Create a new feature',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I will create the feature',
            },
          ],
        },
      ];

      const checkpoint = {
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Create a new authentication feature',
        messages,
        turns: 3,
        maxTurns: 10,
        selectedModel: 'claude-3-5-sonnet-20241022',
        workspaceConfig: {
          owner: 'test-owner',
          repo: 'test-repo',
          defaultBranch: 'main',
        },
      };

      // Save checkpoint
      await checkpointManager.saveCheckpoint(checkpoint);

      // Load checkpoint
      const loadedCheckpoint = await checkpointManager.loadCheckpoint(testJobId);

      expect(loadedCheckpoint).toBeTruthy();
      expect(loadedCheckpoint?.jobId).toBe(testJobId);
      expect(loadedCheckpoint?.workspaceId).toBe(testWorkspaceId);
      expect(loadedCheckpoint?.turns).toBe(3);
      expect(loadedCheckpoint?.maxTurns).toBe(10);
      expect(loadedCheckpoint?.messages).toHaveLength(2);
      expect(loadedCheckpoint?.selectedModel).toBe('claude-3-5-sonnet-20241022');
      expect(loadedCheckpoint?.version).toBe(1);
    });

    it('should return null for non-existent checkpoint', async () => {
      const checkpoint = await checkpointManager.loadCheckpoint('non-existent-job');
      expect(checkpoint).toBeNull();
    });

    it('should check if checkpoint exists', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Test task',
        },
      ];

      // Initially should not exist
      let hasCheckpoint = await checkpointManager.hasCheckpoint(testJobId);
      expect(hasCheckpoint).toBe(false);

      // Save checkpoint
      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Test task',
        messages,
        turns: 1,
        maxTurns: 10,
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      // Now should exist
      hasCheckpoint = await checkpointManager.hasCheckpoint(testJobId);
      expect(hasCheckpoint).toBe(true);
    });
  });

  describe('Checkpoint Metadata', () => {
    it('should get checkpoint metadata', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Test task',
        },
      ];

      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Test task',
        messages,
        turns: 5,
        maxTurns: 10,
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      const metadata = await checkpointManager.getCheckpointMetadata(testJobId);

      expect(metadata).toBeTruthy();
      expect(metadata?.totalCheckpoints).toBe(5);
      expect(metadata?.canResume).toBe(true);
      expect(metadata?.lastCheckpointAt).toBeTruthy();
    });

    it('should return null metadata for non-existent checkpoint', async () => {
      const metadata = await checkpointManager.getCheckpointMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('Checkpoint Deletion', () => {
    it('should delete a checkpoint', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Test task',
        },
      ];

      // Create checkpoint
      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Test task',
        messages,
        turns: 1,
        maxTurns: 10,
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      // Verify it exists
      let hasCheckpoint = await checkpointManager.hasCheckpoint(testJobId);
      expect(hasCheckpoint).toBe(true);

      // Delete it
      await checkpointManager.deleteCheckpoint(testJobId);

      // Verify it's gone
      hasCheckpoint = await checkpointManager.hasCheckpoint(testJobId);
      expect(hasCheckpoint).toBe(false);
    });
  });

  describe('Message History Preservation', () => {
    it('should preserve complete message history with tool calls', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Read the README file',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I will read the README file',
            },
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'read_file',
              input: { path: 'README.md' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-123',
              content: '# My Project\n\nThis is a test project',
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'The README shows this is a test project',
            },
          ],
        },
      ];

      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Read README',
        messages,
        turns: 2,
        maxTurns: 10,
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      const loadedCheckpoint = await checkpointManager.loadCheckpoint(testJobId);

      expect(loadedCheckpoint?.messages).toHaveLength(4);

      // Check message structure is preserved
      const assistantMsg = loadedCheckpoint?.messages[1];
      expect(assistantMsg?.role).toBe('assistant');
      expect(Array.isArray(assistantMsg?.content)).toBe(true);

      const content = assistantMsg?.content as any[];
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('tool_use');
      expect(content[1].name).toBe('read_file');
    });

    it('should preserve reasoning content for DeepSeek', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Solve this problem',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Here is the solution',
            },
          ],
          reasoning_content: 'Let me think about this step by step...',
        },
      ];

      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Problem solving',
        messages,
        turns: 1,
        maxTurns: 10,
        selectedModel: 'deepseek-reasoner',
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      const loadedCheckpoint = await checkpointManager.loadCheckpoint(testJobId);

      const assistantMsg = loadedCheckpoint?.messages[1];
      expect(assistantMsg?.reasoning_content).toBe('Let me think about this step by step...');
    });
  });

  describe('Checkpoint Updates', () => {
    it('should update checkpoint on each turn', async () => {
      let messages: Message[] = [
        {
          role: 'user',
          content: 'Task 1',
        },
      ];

      // First checkpoint
      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Multi-turn task',
        messages,
        turns: 1,
        maxTurns: 10,
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      let checkpoint = await checkpointManager.loadCheckpoint(testJobId);
      expect(checkpoint?.turns).toBe(1);
      expect(checkpoint?.messages).toHaveLength(1);

      // Second checkpoint with more messages
      messages = [
        ...messages,
        {
          role: 'assistant',
          content: 'Done task 1',
        },
        {
          role: 'user',
          content: 'Task 2',
        },
      ];

      await checkpointManager.saveCheckpoint({
        jobId: testJobId,
        workspaceId: testWorkspaceId,
        taskDescription: 'Multi-turn task',
        messages,
        turns: 2,
        maxTurns: 10,
        workspaceConfig: {
          owner: 'test',
          repo: 'test',
          defaultBranch: 'main',
        },
      });

      checkpoint = await checkpointManager.loadCheckpoint(testJobId);
      expect(checkpoint?.turns).toBe(2);
      expect(checkpoint?.messages).toHaveLength(3);
    });
  });
});
