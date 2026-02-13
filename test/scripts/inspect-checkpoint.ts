#!/usr/bin/env tsx

import 'dotenv/config';
import { checkpointManager } from '../../src/agent/checkpoint.js';
import { getJobStatus, redisConnection } from '../../src/jobs/queue.js';
import { ContentBlock } from '../../src/llm/types.js';

async function inspectCheckpoint(jobId: string, verbose: boolean = false) {
  console.log(`🔍 Inspecting checkpoint for job ${jobId}...\n`);

  try {
    const checkpoint = await checkpointManager.loadCheckpoint(jobId);

    if (!checkpoint) {
      console.log(`❌ No checkpoint found for job ${jobId}`);
      return;
    }

    const jobStatus = await getJobStatus(jobId);

    // Basic info
    console.log(`📋 Checkpoint Information:`);
    console.log(`   Job ID: ${checkpoint.jobId}`);
    console.log(`   Workspace ID: ${checkpoint.workspaceId}`);
    console.log(`   Status: ${jobStatus.status}`);
    console.log(`   Version: ${checkpoint.version}`);
    console.log(`   Last Updated: ${new Date(checkpoint.lastUpdated).toLocaleString()}`);
    console.log('');

    // Progress
    console.log(`📊 Progress:`);
    console.log(`   Turns: ${checkpoint.turns}/${checkpoint.maxTurns} (${Math.round((checkpoint.turns / checkpoint.maxTurns) * 100)}%)`);
    console.log(`   Messages: ${checkpoint.messages.length}`);
    console.log('');

    // Task
    console.log(`📝 Task:`);
    console.log(`   ${checkpoint.taskDescription}`);
    console.log('');

    // Workspace
    console.log(`🗂️  Workspace:`);
    console.log(`   Owner: ${checkpoint.workspaceConfig.owner}`);
    console.log(`   Repo: ${checkpoint.workspaceConfig.repo}`);
    console.log(`   Branch: ${checkpoint.workspaceConfig.defaultBranch}`);
    console.log('');

    // Model
    console.log(`🤖 Model:`);
    console.log(`   ${checkpoint.selectedModel || 'default'}`);
    console.log('');

    // Message history summary
    console.log(`💬 Message History (${checkpoint.messages.length} messages):`);

    const userMessages = checkpoint.messages.filter(m => m.role === 'user');
    const assistantMessages = checkpoint.messages.filter(m => m.role === 'assistant');

    console.log(`   User messages: ${userMessages.length}`);
    console.log(`   Assistant messages: ${assistantMessages.length}`);
    console.log('');

    // Tool usage summary
    const toolUsages: Record<string, number> = {};
    let totalToolCalls = 0;

    for (const message of checkpoint.messages) {
      if (Array.isArray(message.content)) {
        for (const block of message.content as ContentBlock[]) {
          if (block.type === 'tool_use' && block.name) {
            toolUsages[block.name] = (toolUsages[block.name] || 0) + 1;
            totalToolCalls++;
          }
        }
      }
    }

    if (totalToolCalls > 0) {
      console.log(`🔧 Tool Usage (${totalToolCalls} total calls):`);
      for (const [tool, count] of Object.entries(toolUsages).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${tool}: ${count}`);
      }
      console.log('');
    }

    // Verbose mode - show full message history
    if (verbose) {
      console.log(`📜 Full Message History:\n`);

      for (let i = 0; i < checkpoint.messages.length; i++) {
        const msg = checkpoint.messages[i];
        console.log(`--- Message ${i + 1} (${msg.role}) ---`);

        if (typeof msg.content === 'string') {
          console.log(msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : ''));
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content as ContentBlock[]) {
            if (block.type === 'text' && block.text) {
              console.log(`[text] ${block.text.slice(0, 150) + (block.text.length > 150 ? '...' : '')}`);
            } else if (block.type === 'tool_use') {
              console.log(`[tool_use] ${block.name} - ID: ${block.id}`);
              console.log(`  Input: ${JSON.stringify(block.input).slice(0, 100)}...`);
            } else if (block.type === 'tool_result') {
              console.log(`[tool_result] ID: ${block.tool_use_id}`);
              const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
              console.log(`  Result: ${content.slice(0, 100)}...`);
            }
          }
        }

        if (msg.reasoning_content) {
          console.log(`[reasoning] ${msg.reasoning_content.slice(0, 150)}...`);
        }

        console.log('');
      }
    }

    // Resume status
    console.log(`🔄 Resume Status:`);
    const canResume = jobStatus.status === 'failed' || jobStatus.status === 'unknown';
    console.log(`   Can Resume: ${canResume ? '✅ Yes' : '❌ No'}`);
    if (canResume) {
      console.log(`   Command: npm run test:resume ${jobId}`);
    }

  } catch (error) {
    console.error('❌ Error inspecting checkpoint:', error);
  } finally {
    await redisConnection.quit();
  }
}

// Get job ID and verbose flag from command line
const jobId = process.argv[2];
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

if (!jobId) {
  console.log('Usage: npm run test:inspect <jobId> [--verbose]');
  console.log('');
  console.log('Example: npm run test:inspect 123');
  console.log('Example: npm run test:inspect 123 --verbose');
  process.exit(1);
}

inspectCheckpoint(jobId, verbose);
