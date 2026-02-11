# End-to-End Tests

Comprehensive E2E tests that cover the entire flow from webhook call through to 100% worker completion.

## Overview

These tests validate the complete workflow:
1. **Webhook Reception** - POST to `/webhook` endpoint
2. **Job Queuing** - Job added to Redis queue via BullMQ
3. **Worker Processing** - Worker picks up and processes the job
4. **Progress Tracking** - Progress updates from 0% to 100%
5. **Callback Notification** - Callback sent on completion

## Test Suites

### 1. Webhook to Worker Flow (`webhook-to-worker.test.ts`)

Tests the basic end-to-end flow:
- ✅ Webhook acceptance and job queueing
- ✅ Worker picks up and processes jobs
- ✅ Successful job completion
- ✅ Invalid payload validation
- ✅ Job priority handling
- ✅ Job failure scenarios
- ✅ Job metadata preservation

### 2. Progress Tracking (`progress-tracking.test.ts`)

Tests progress updates throughout the job lifecycle:
- ✅ Progress from 0% to 100%
- ✅ All expected milestones (10%, 20%, 90%, 100%)
- ✅ Turn-by-turn tracking during agent loop
- ✅ Progress reporting via status endpoint
- ✅ Monotonically increasing progress
- ✅ Agent loop progress updates (20-90% range)

**Expected Progress Milestones:**
- 10% - Workspace created
- 20% - Agent loop starting
- 20-90% - Agent loop running (with turn information)
- 90% - Agent loop completed
- 100% - Job fully completed

### 3. Callback Integration (`callback-integration.test.ts`)

Tests callback notifications:
- ✅ Callback on successful completion
- ✅ Callback on job failure
- ✅ No callback when URL not provided
- ✅ Graceful handling of unavailable callback servers
- ✅ Complete callback payload validation
- ✅ Single callback per job (no duplicates)

## Prerequisites

1. **Redis Running**
   ```bash
   # Using Docker
   docker-compose up -d redis

   # Or locally
   redis-server
   ```

2. **Environment Variables**
   ```bash
   cp .env.example .env
   # Configure your .env file
   ```

## Running Tests

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Tests in Watch Mode
```bash
npm run test:e2e:watch
```

### Run Tests with UI
```bash
npm run test:e2e:ui
```

### Run with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npx vitest run test/e2e/webhook-to-worker.test.ts
```

### Run Specific Test Case
```bash
npx vitest run -t "should accept webhook, queue job"
```

## Test Architecture

### Mocking Strategy

The tests mock external dependencies to avoid requiring real credentials:

```typescript
// Mocked: GitHub workspace creation
vi.mock('../../src/sandbox/workspace.js', () => ({
  createWorkspace: vi.fn().mockResolvedValue({...}),
  cleanupJobWorkspaces: vi.fn().mockResolvedValue(undefined),
}));

// Mocked: Agent execution
vi.mock('../../src/agent/loop.js', () => ({
  runAgentLoop: vi.fn().mockImplementation(async (...) => {
    // Simulates agent behavior with progress callbacks
  }),
}));
```

### Test Utilities

- **`setup.ts`** - Test infrastructure and helper classes
  - `setupTestRedis()` - Creates test Redis connection
  - `waitForJobCompletion()` - Waits for job to finish
  - `getJobProgressUpdates()` - Collects all progress updates
  - `MockCallbackServer` - Mock HTTP server for testing callbacks

- **`helpers.ts`** - Test data builders and validators
  - `createTestJobData()` - Creates test job payloads
  - `validateProgressSequence()` - Validates progress update order
  - `waitUntil()` - Polling helper with timeout

### Isolated Tests

Each test:
- Creates its own job instances
- Tracks created job IDs for cleanup
- Cleans up after execution
- Runs in isolation from other tests

## Debugging Tests

### Enable Verbose Logging
```bash
DEBUG=* npm run test:e2e
```

### Run Single Test File
```bash
npx vitest run test/e2e/webhook-to-worker.test.ts --reporter=verbose
```

### Inspect Redis During Tests
```bash
# In another terminal
redis-cli

# List all keys
KEYS *

# Get queue info
LLEN bull:ai-coder-jobs:waiting
LLEN bull:ai-coder-jobs:active

# Get job details
HGETALL bull:ai-coder-jobs:<jobId>
```

### Common Issues

**Tests timing out:**
- Increase timeout in `vitest.config.ts`
- Check Redis is running and accessible
- Verify environment variables are set

**Redis connection errors:**
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_URL in environment
- Verify Redis port is not blocked

**Worker not processing jobs:**
- Check worker is started in test setup
- Verify queue name matches ('ai-coder-jobs')
- Look for errors in worker event handlers

## Test Coverage

Current coverage includes:

### Webhook Layer
- ✅ Payload validation (required fields, types, formats)
- ✅ Job queueing with correct priority
- ✅ Response format (jobId, status, statusUrl)

### Queue Layer
- ✅ Job persistence in Redis
- ✅ Priority-based processing
- ✅ Job state transitions (waiting → active → completed/failed)
- ✅ Job data preservation

### Worker Layer
- ✅ Job pickup from queue
- ✅ Job processing with progress updates
- ✅ Error handling and retries
- ✅ Workspace creation and cleanup

### Progress Tracking
- ✅ All milestone percentages (10%, 20%, 90%, 100%)
- ✅ Turn information during agent loop
- ✅ Monotonic progress increases
- ✅ Status endpoint reporting

### Callback System
- ✅ Successful completion callbacks
- ✅ Failure callbacks with error details
- ✅ Optional callback handling
- ✅ Resilience to callback failures

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
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

      - run: npm ci
      - run: npm run test:e2e
      - run: npm run test:coverage

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Future Enhancements

Potential additions:
- [ ] Integration with real GitHub repositories (sandbox)
- [ ] Load testing with multiple concurrent jobs
- [ ] Testing retry mechanisms and failure recovery
- [ ] Testing rate limiting
- [ ] Testing job cancellation
- [ ] Testing webhook authentication/authorization
- [ ] Performance benchmarking

## Contributing

When adding new tests:
1. Follow existing test structure and naming
2. Use provided test utilities and helpers
3. Mock external dependencies
4. Clean up resources in `afterEach`
5. Document test purpose and assertions
6. Update this README with new test coverage

## Resources

- [Vitest Documentation](https://vitest.dev)
- [BullMQ Testing Guide](https://docs.bullmq.io/guide/testing)
- [Fastify Testing](https://fastify.dev/docs/latest/Guides/Testing/)
- [Supertest Documentation](https://github.com/ladjs/supertest)
