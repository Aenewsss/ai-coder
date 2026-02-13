#!/usr/bin/env tsx

import 'dotenv/config';
import { checkpointManager } from '../../src/agent/checkpoint.js';
import { jobQueue, getJobStatus, redisConnection } from '../../src/jobs/queue.js';

async function resumeFromCheckpoint(jobId: string) {
  console.log(`🔄 Attempting to resume job ${jobId}...\n`);

  try {
    // Check if checkpoint exists
    const hasCheckpoint = await checkpointManager.hasCheckpoint(jobId);

    if (!hasCheckpoint) {
      console.log(`❌ No checkpoint found for job ${jobId}`);
      return;
    }

    // Load checkpoint
    const checkpoint = await checkpointManager.loadCheckpoint(jobId);

    if (!checkpoint) {
      console.log(`❌ Failed to load checkpoint for job ${jobId}`);
      return;
    }

    console.log(`📋 Checkpoint found:`);
    console.log(`   Turns: ${checkpoint.turns}/${checkpoint.maxTurns}`);
    console.log(`   Messages: ${checkpoint.messages.length}`);
    console.log(`   Last Updated: ${new Date(checkpoint.lastUpdated).toLocaleString()}`);
    console.log(`   Task: ${checkpoint.taskDescription.slice(0, 80)}...`);
    console.log('');

    // Check job status
    const jobStatus = await getJobStatus(jobId);

    console.log(`📊 Current job status: ${jobStatus.status}`);

    if (jobStatus.status === 'active' || jobStatus.status === 'queued') {
      console.log(`❌ Cannot resume: Job is currently ${jobStatus.status}`);
      return;
    }

    if (jobStatus.status === 'completed') {
      console.log(`❌ Cannot resume: Job already completed successfully`);
      return;
    }

    // Get original job data
    const originalJob = await jobQueue.getJob(jobId);

    if (!originalJob) {
      console.log(`❌ Cannot find original job data`);
      return;
    }

    console.log('');
    console.log(`✅ Job can be resumed. Creating new job...`);

    // Create new job with resume flag
    const newJob = await jobQueue.add('process-task', {
      ...originalJob.data,
      _resume: {
        fromJobId: jobId,
        resumedAt: new Date().toISOString(),
      },
    });

    console.log('');
    console.log(`🎉 Job resumed successfully!`);
    console.log(`   Original Job ID: ${jobId}`);
    console.log(`   New Job ID: ${newJob.id}`);
    console.log(`   Resuming from turn: ${checkpoint.turns}`);
    console.log('');
    console.log(`💡 Monitor progress with: npm run test:monitor ${newJob.id}`);
  } catch (error) {
    console.error('❌ Error resuming job:', error);
  } finally {
    await redisConnection.quit();
  }
}

// Get job ID from command line
const jobId = process.argv[2];

if (!jobId) {
  console.log('Usage: npm run test:resume <jobId>');
  console.log('');
  console.log('Example: npm run test:resume 123');
  process.exit(1);
}

resumeFromCheckpoint(jobId);
