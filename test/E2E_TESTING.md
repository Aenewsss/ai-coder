# End-to-End Testing Guide

Complete guide for running automated E2E tests that validate the entire webhook-to-worker flow.

## Quick Start

```bash
# 1. Ensure Redis is running
docker-compose up -d redis

# 2. Install dependencies (if not already done)
npm install

# 3. Run E2E tests
npm run test:e2e
```

## What Gets Tested

The E2E tests cover the **complete workflow** from webhook call to 100% job completion:

```
Webhook POST → Queue Job → Worker Picks Up → Process (0-100%) → Callback Sent
```

### Complete Test Coverage

#### 1. **Webhook to Worker Flow** ✅
   - Webhook accepts valid payloads and queues jobs
   - Jobs are assigned unique IDs
   - Invalid payloads are rejected with validation errors
   - Job priority is respected (high > normal > low)
   - Worker picks up and processes jobs
   - Jobs complete successfully with PR URLs
   - Failed jobs are handled gracefully

#### 2. **Progress Tracking (0% → 100%)** ✅
   - **10%** - Workspace created
   - **20%** - Agent loop starting
   - **20-90%** - Agent loop running with turn-by-turn updates
   - **90%** - Agent loop completed
   - **100%** - Job fully completed

   Each progress update includes:
   - `percentage`: Current progress (0-100)
   - `turn`: Current agent turn (during agent loop)
   - `maxTurns`: Total agent turns (during agent loop)

#### 3. **Callback Integration** ✅
   - Callbacks sent on successful completion
   - Callbacks sent on job failure (with error details)
   - Callback payload includes all job details
   - Graceful handling when callback server is unavailable
   - No callback sent when URL is not provided
   - Only one callback sent per job (no duplicates)

## Test Suites

### webhook-to-worker.test.ts
**Basic end-to-end flow validation**

Tests:
- ✅ Complete webhook → worker → completion flow
- ✅ Invalid payload handling (400 errors)
- ✅ Job priority in queue
- ✅ Job failure handling
- ✅ Job metadata preservation

### progress-tracking.test.ts
**Progress updates from 0% to 100%**

Tests:
- ✅ All progress milestones hit (10%, 20%, 90%, 100%)
- ✅ Turn information during agent loop
- ✅ Progress via status endpoint
- ✅ Final 100% on completion
- ✅ Monotonically increasing percentages

### callback-integration.test.ts
**Callback notification system**

Tests:
- ✅ Callback on success (with PR URL)
- ✅ Callback on failure (with error)
- ✅ Optional callback handling
- ✅ Callback server unavailability
- ✅ Complete callback payload
- ✅ Single callback per job

## Running Tests

### All Tests
```bash
npm run test:e2e
```

### Watch Mode (auto-rerun on changes)
```bash
npm run test:e2e:watch
```

### With UI (interactive browser interface)
```bash
npm run test:e2e:ui
```

### With Coverage Report
```bash
npm run test:coverage
```

### Single Test File
```bash
npx vitest run test/e2e/webhook-to-worker.test.ts
```

### Specific Test
```bash
npx vitest run -t "should track progress from webhook to 100%"
```

## Test Output

Successful test run:
```
✓ test/e2e/webhook-to-worker.test.ts (5)
  ✓ E2E: Webhook to Worker Flow (5)
    ✓ should accept webhook, queue job, process it, and complete successfully
    ✓ should handle invalid webhook payloads
    ✓ should respect job priority in queue
    ✓ should handle job failures gracefully
    ✓ should create job with correct metadata

✓ test/e2e/progress-tracking.test.ts (5)
  ✓ E2E: Progress Tracking from 0% to 100% (5)
    ✓ should track progress from webhook to 100% completion
    ✓ should include turn information in progress during agent loop
    ✓ should report progress via status endpoint
    ✓ should show 100% progress when job completes
    ✓ should have monotonically increasing progress percentages

✓ test/e2e/callback-integration.test.ts (6)
  ✓ E2E: Callback Integration (6)
    ✓ should send callback when job completes successfully
    ✓ should send callback when job fails
    ✓ should not send callback when callback URL is not provided
    ✓ should handle callback server being unavailable gracefully
    ✓ should include all job details in callback
    ✓ should send callback only once per job

Test Files  3 passed (3)
     Tests  16 passed (16)
```

## Architecture

### How Tests Work

1. **Setup Phase** (beforeAll)
   - Start mock callback server (for callback tests)
   - Connect to Redis
   - Create BullMQ queue
   - Start Fastify API server
   - Start BullMQ worker
   - Mock external dependencies (GitHub, Claude AI)

2. **Test Execution**
   - Send POST to `/webhook` endpoint
   - Verify job queued in Redis
   - Wait for worker to pick up job
   - Track progress updates in real-time
   - Wait for job completion
   - Verify final result and callback

3. **Cleanup Phase** (afterEach, afterAll)
   - Remove test jobs from queue
   - Clear callback server data
   - Close all connections

### Mocking Strategy

External dependencies are mocked to avoid requiring real credentials:

```typescript
// Mock GitHub workspace creation
vi.mock('../../src/sandbox/workspace.js')

// Mock Claude AI agent execution
vi.mock('../../src/agent/loop.js')
```

This allows tests to:
- Run without GitHub credentials
- Run without Claude API key
- Execute quickly (no real API calls)
- Be deterministic and reliable

## Debugging

### View Redis During Tests
```bash
# In another terminal while tests run
redis-cli

# List all keys
KEYS *

# View queue length
LLEN bull:ai-coder-jobs:waiting
LLEN bull:ai-coder-jobs:active

# Inspect specific job
HGETALL bull:ai-coder-jobs:<jobId>
```

### Enable Verbose Logging
```bash
DEBUG=* npm run test:e2e
```

### Run with Vitest UI
```bash
npm run test:e2e:ui
# Opens browser with interactive test runner
```

## Troubleshooting

### Tests Timeout
**Symptom:** Tests fail with timeout errors

**Solutions:**
- Ensure Redis is running: `redis-cli ping`
- Increase timeout in `vitest.config.ts`
- Check no other workers are processing the test jobs

### Redis Connection Errors
**Symptom:** "ECONNREFUSED" or "Connection refused"

**Solutions:**
```bash
# Start Redis
docker-compose up -d redis

# Or locally
redis-server

# Verify it's running
redis-cli ping  # Should return "PONG"
```

### Worker Not Processing Jobs
**Symptom:** Jobs stuck in "waiting" state

**Solutions:**
- Check worker started in test setup
- Verify queue name matches ('ai-coder-jobs')
- Look for worker errors in test output

### Callback Tests Failing
**Symptom:** Callback tests timeout or fail

**Solutions:**
- Check callback server started (port 3999)
- Verify no port conflicts
- Check firewall/network restrictions

## Comparison with Manual Testing

### Manual Testing Scripts (test/scripts/)
- Good for: Interactive testing, debugging, real integrations
- Require: Running API server, worker, and Redis manually
- Examples: `send-webhook.sh`, `monitor-job.ts`, `callback-server.ts`

### Automated E2E Tests (test/e2e/)
- Good for: CI/CD, regression testing, validation
- Require: Only Redis (everything else auto-started)
- Examples: All `*.test.ts` files

**Use both:** Manual scripts for development, E2E tests for validation

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Generate coverage
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Next Steps

After running E2E tests successfully:

1. **View Coverage Report**
   ```bash
   npm run test:coverage
   open coverage/index.html
   ```

2. **Run Manual Tests** (with real GitHub)
   ```bash
   npm run dev           # Terminal 1
   npm run dev:worker    # Terminal 2
   npm run test:webhook test/payloads/simple-task.json
   ```

3. **Add More Tests** (optional)
   - See `test/e2e/README.md` for contributing guide
   - Add tests for edge cases specific to your use case

## Summary

✅ **Comprehensive Coverage**: Webhook → Queue → Worker → Callback

✅ **Progress Tracking**: All milestones (10%, 20%, 20-90%, 90%, 100%)

✅ **Automated**: No manual intervention required

✅ **Fast**: Runs in ~60 seconds with mocked dependencies

✅ **Reliable**: Isolated tests, no flakiness

✅ **CI-Ready**: Easy to integrate into pipelines

For more details, see [`test/e2e/README.md`](./e2e/README.md).
