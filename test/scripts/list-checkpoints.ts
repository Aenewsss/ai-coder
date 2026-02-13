#!/usr/bin/env tsx

import 'dotenv/config';
import { checkpointManager } from '../../src/agent/checkpoint.js';
import { getJobStatus } from '../../src/jobs/queue.js';
import { redisConnection } from '../../src/jobs/queue.js';

async function listCheckpoints() {
  console.log('🔍 Listing active checkpoints...\n');

  try {
    const activeCheckpoints = await checkpointManager.listActiveCheckpoints();

    if (activeCheckpoints.length === 0) {
      console.log('✨ No active checkpoints found');
      return;
    }

    console.log(`Found ${activeCheckpoints.length} checkpoint(s):\n`);

    for (const jobId of activeCheckpoints) {
      const checkpoint = await checkpointManager.loadCheckpoint(jobId);
      const jobStatus = await getJobStatus(jobId);

      if (!checkpoint) {
        console.log(`❌ Job ${jobId}: Checkpoint exists but couldn't be loaded`);
        continue;
      }

      console.log(`📋 Job ID: ${jobId}`);
      console.log(`   Status: ${jobStatus.status}`);
      console.log(`   Turns: ${checkpoint.turns}/${checkpoint.maxTurns}`);
      console.log(`   Messages: ${checkpoint.messages.length}`);
      console.log(`   Model: ${checkpoint.selectedModel || 'default'}`);
      console.log(`   Task: ${checkpoint.taskDescription.slice(0, 80)}...`);
      console.log(`   Last Updated: ${new Date(checkpoint.lastUpdated).toLocaleString()}`);
      console.log(`   Workspace: ${checkpoint.workspaceConfig.owner}/${checkpoint.workspaceConfig.repo}`);
      console.log(`   Can Resume: ${jobStatus.status === 'failed' || jobStatus.status === 'unknown' ? '✅ Yes' : '❌ No'}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error listing checkpoints:', error);
  } finally {
    await redisConnection.quit();
  }
}

listCheckpoints();
