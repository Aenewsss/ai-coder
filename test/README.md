# AI Coder - Test Guide

Complete guide for testing the AI Coder webhook and worker system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Available Test Payloads](#available-test-payloads)
- [Testing Workflow](#testing-workflow)
- [Test Scripts](#test-scripts)
- [Testing Scenarios](#testing-scenarios)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before running tests, ensure you have:

1. **Redis running**
   ```bash
   # Using Docker
   docker-compose up -d redis

   # Or locally
   redis-server
   ```

2. **Environment variables configured**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Application running**
   ```bash
   # Terminal 1: Start API server
   npm run dev

   # Terminal 2: Start worker
   npm run dev:worker
   ```

## Available Test Payloads

The `test/payloads/` directory contains example webhook payloads:

| File | Description | Priority |
|------|-------------|----------|
| `simple-task.json` | Basic task for README modification | Normal |
| `high-priority-task.json` | Urgent bug fix task | High |
| `low-priority-task.json` | Documentation update | Low |
| `with-callback.json` | Task with callback URL | Normal |
| `complex-task.json` | Multi-step API implementation | Normal |
| `invalid-payload.json` | Invalid payload for error testing | - |

## Testing Workflow

### 1. Basic Test Flow

```bash
# 1. Send a webhook request
npm run test:webhook test/payloads/simple-task.json

# 2. Note the returned jobId, then monitor it
npm run test:monitor <jobId>

# 3. List all jobs
npm run test:list

# 4. Cleanup completed jobs
npm run test:cleanup
```

### 2. With Callback Server

```bash
# Terminal 1: Start callback server
npm run test:callback

# Terminal 2: Send webhook with callback
npm run test:webhook test/payloads/with-callback.json

# The callback server will display notifications when jobs complete
```

## Test Scripts

### `npm run test:webhook [PAYLOAD_FILE]`

Send a webhook request to the API.

**Usage:**
```bash
# List available payloads
npm run test:webhook

# Send specific payload
npm run test:webhook test/payloads/simple-task.json

# Use custom API URL
API_URL=https://api.example.com npm run test:webhook test/payloads/simple-task.json
```

**Output:**
- Returns job ID and status URL
- Provides commands to monitor the job

### `npm run test:monitor <jobId> [mode]`

Monitor a job in real-time.

**Usage:**
```bash
# Monitor via API (default)
npm run test:monitor abc123

# Monitor via Redis (more detailed)
npm run test:monitor abc123 redis
```

**Features:**
- Live progress updates
- Turn-by-turn tracking
- Completion notifications
- Error details

### `npm run test:list`

List all jobs in the queue.

**Usage:**
```bash
npm run test:list
```

**Output:**
- Waiting jobs (queued)
- Active jobs (processing)
- Completed jobs (last 10)
- Failed jobs (last 10)
- Summary statistics

### `npm run test:cleanup`

Clean up completed and failed jobs.

**Usage:**
```bash
npm run test:cleanup
```

**Effect:**
- Removes all completed jobs
- Removes all failed jobs
- Shows before/after counts

### `npm run test:callback`

Start a callback server to receive job completion notifications.

**Usage:**
```bash
# Default port (3001)
npm run test:callback

# Custom port
PORT=4000 npm run test:callback
```

**Endpoints:**
- `POST /callback` - Receives callbacks
- `GET /callbacks` - View all received callbacks
- `GET /health` - Health check

## Testing Scenarios

### Scenario 1: Simple Task Test

Test basic webhook functionality.

```bash
# 1. Start services
npm run dev          # Terminal 1
npm run dev:worker   # Terminal 2

# 2. Send simple task
npm run test:webhook test/payloads/simple-task.json

# 3. Monitor progress
npm run test:monitor <jobId>
```

**Expected Result:**
- Job queued successfully
- Worker picks up job
- Progress updates shown
- Job completes or fails with details

### Scenario 2: Priority Queue Test

Test job prioritization.

```bash
# Send low priority task
npm run test:webhook test/payloads/low-priority-task.json

# Send high priority task
npm run test:webhook test/payloads/high-priority-task.json

# Send normal priority task
npm run test:webhook test/payloads/simple-task.json

# List jobs to see order
npm run test:list
```

**Expected Result:**
- High priority jobs processed first
- Normal priority next
- Low priority last

### Scenario 3: Callback Integration Test

Test webhook callbacks.

```bash
# 1. Start callback server
npm run test:callback   # Terminal 3

# 2. Send task with callback
npm run test:webhook test/payloads/with-callback.json

# 3. Watch callback server for notifications
```

**Expected Result:**
- Callback received on job completion
- Callback contains job result and PR URL

### Scenario 4: Error Handling Test

Test validation and error handling.

```bash
# Send invalid payload
npm run test:webhook test/payloads/invalid-payload.json
```

**Expected Result:**
- Returns 400 error
- Shows validation errors
- Job not queued

### Scenario 5: Multiple Jobs Test

Test concurrent job processing.

```bash
# Send multiple jobs
npm run test:webhook test/payloads/simple-task.json
npm run test:webhook test/payloads/complex-task.json
npm run test:webhook test/payloads/high-priority-task.json

# Monitor queue
npm run test:list

# Monitor each job
npm run test:monitor <jobId1>
```

**Expected Result:**
- Jobs queued in priority order
- Worker processes one at a time
- Rate limiting applied (max 10/minute)

### Scenario 6: Worker Recovery Test

Test worker resilience.

```bash
# 1. Start monitoring a long-running job
npm run test:webhook test/payloads/complex-task.json
npm run test:monitor <jobId>

# 2. Stop worker (Ctrl+C in worker terminal)

# 3. Restart worker
npm run dev:worker

# 4. Worker should resume processing
```

**Expected Result:**
- Job retried after worker restart
- No job data lost
- Progress continues from last checkpoint

## Troubleshooting

### Jobs not processing

**Check:**
1. Redis is running: `redis-cli ping`
2. Worker is running: `npm run dev:worker`
3. Check logs: `tail -f logs/app.log`

### Webhook returns 400

**Check:**
1. Payload structure matches schema
2. All required fields present
3. Valid installation ID and repo access

### Monitor script not showing progress

**Check:**
1. Job ID is correct
2. API server is running
3. Job hasn't already completed

### Callback not received

**Check:**
1. Callback server is running
2. Callback URL is accessible
3. Payload includes callback field

### Jobs stuck in queue

**Check:**
1. Worker error logs
2. Redis connection
3. Rate limiting (max 10/min)

### Clean up stuck jobs

```bash
# View all jobs
npm run test:list

# Clean up
npm run test:cleanup

# Or manually in Redis
redis-cli FLUSHDB
```

## Advanced Testing

### Custom Payloads

Create your own test payloads:

```json
{
  "task": {
    "description": "Your task description here",
    "priority": "normal"
  },
  "organization": {
    "id": "org_id",
    "name": "Org Name",
    "installationId": 12345678
  },
  "repository": {
    "owner": "repo-owner",
    "name": "repo-name",
    "defaultBranch": "main"
  },
  "callback": {
    "url": "http://localhost:3001/callback"
  }
}
```

### Direct API Testing

```bash
# Using curl
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d @test/payloads/simple-task.json

# Check job status
curl http://localhost:3000/jobs/<jobId> | jq

# Check health
curl http://localhost:3000/health | jq
```

### Redis CLI Inspection

```bash
# Connect to Redis
redis-cli

# List all keys
KEYS *

# Get queue info
LLEN bull:ai-coder-jobs:waiting
LLEN bull:ai-coder-jobs:active

# Get job details
HGETALL bull:ai-coder-jobs:<jobId>
```

## Logs

Check application logs for detailed information:

```bash
# Real-time logs
tail -f logs/app.log

# Filter by job ID
grep "jobId\":\"<jobId>" logs/app.log

# Filter errors
grep "error" logs/app.log | tail -n 50

# Pretty print JSON logs
tail -f logs/app.log | jq
```

## Tips

1. **Use callback server** for long-running tasks instead of polling
2. **Monitor logs** alongside monitoring scripts for detailed debugging
3. **Clean up regularly** to keep Redis storage manageable
4. **Test priorities** to ensure urgent tasks are processed first
5. **Use invalid payloads** to verify error handling
6. **Test edge cases** like very long descriptions or special characters

## Next Steps

After testing locally:

1. Test with real GitHub repositories
2. Verify PR creation and code changes
3. Test with different repository structures
4. Validate callback integrations
5. Load test with multiple concurrent jobs
