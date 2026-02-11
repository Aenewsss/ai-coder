# Quick Start - Testing Guide

Fast reference for testing the AI Coder system.

## 🚀 Quick Setup

```bash
# 1. Start Redis
docker-compose up -d redis

# 2. Start API (Terminal 1)
npm run dev

# 3. Start Worker (Terminal 2)
npm run dev:worker

# 4. Send test webhook (Terminal 3)
npm run test:webhook test/payloads/simple-task.json
```

## 📝 Common Commands

### Send Webhooks

```bash
# List available payloads
npm run test:webhook

# Send a simple task
npm run test:webhook test/payloads/simple-task.json

# Send a high priority task
npm run test:webhook test/payloads/high-priority-task.json

# Send with callback
npm run test:webhook test/payloads/with-callback.json
```

### Monitor Jobs

```bash
# Monitor a specific job (replace <jobId> with actual ID)
npm run test:monitor <jobId>

# List all jobs
npm run test:list

# Clean up old jobs
npm run test:cleanup
```

### Callback Testing

```bash
# Terminal 1: Start callback server
npm run test:callback

# Terminal 2: Send webhook with callback
npm run test:webhook test/payloads/with-callback.json

# Watch Terminal 1 for callback notifications
```

## 🧪 Test Scenarios

### Test 1: Basic Flow
```bash
npm run test:webhook test/payloads/simple-task.json
# Copy the jobId from response
npm run test:monitor <jobId>
```

### Test 2: Priority Testing
```bash
# Send jobs in this order
npm run test:webhook test/payloads/low-priority-task.json
npm run test:webhook test/payloads/high-priority-task.json
npm run test:webhook test/payloads/simple-task.json

# High priority will be processed first
npm run test:list
```

### Test 3: Error Handling
```bash
# Send invalid payload
npm run test:webhook test/payloads/invalid-payload.json
# Should return validation error
```

### Test 4: With Callbacks
```bash
# Terminal 1
npm run test:callback

# Terminal 2
npm run test:webhook test/payloads/with-callback.json
```

## 🔍 Direct API Testing

### Using curl

```bash
# Send webhook
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d @test/payloads/simple-task.json

# Check job status
curl http://localhost:3000/jobs/<jobId> | jq

# Health check
curl http://localhost:3000/health | jq
```

### Using HTTPie (if installed)

```bash
# Send webhook
http POST localhost:3000/webhook < test/payloads/simple-task.json

# Check job status
http GET localhost:3000/jobs/<jobId>
```

## 📊 Monitoring

### View Logs

```bash
# Real-time logs
tail -f logs/app.log

# Filter by job ID
grep "jobId\":\"<jobId>" logs/app.log

# Show only errors
grep "error" logs/app.log
```

### Redis Monitoring

```bash
# Connect to Redis
redis-cli

# List queue jobs
KEYS bull:ai-coder-jobs:*

# Get queue length
LLEN bull:ai-coder-jobs:waiting
LLEN bull:ai-coder-jobs:active
```

## 🛠️ Troubleshooting

### Jobs Not Processing?

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Check if worker is running
# Look for "Worker is ready" in worker terminal

# View logs
tail -f logs/app.log
```

### Webhook Returns 400?

- Check payload structure
- Ensure all required fields are present
- Validate JSON syntax

```bash
# Validate JSON
cat test/payloads/simple-task.json | jq
```

### Clean Up Everything

```bash
# Clean up jobs
npm run test:cleanup

# Or flush Redis (WARNING: removes all data)
redis-cli FLUSHDB
```

## 🎯 Testing Checklist

- [ ] Redis is running
- [ ] API server is running (`npm run dev`)
- [ ] Worker is running (`npm run dev:worker`)
- [ ] Environment variables are set (`.env`)
- [ ] Can send simple webhook successfully
- [ ] Can monitor job progress
- [ ] Jobs complete successfully
- [ ] Callbacks work (if using)

## 📦 Available Payloads

| Payload | Use Case |
|---------|----------|
| `simple-task.json` | Basic functionality test |
| `high-priority-task.json` | Priority queue test |
| `low-priority-task.json` | Low priority test |
| `with-callback.json` | Callback integration test |
| `complex-task.json` | Complex multi-step task |
| `invalid-payload.json` | Error handling test |

## 🔗 Useful Links

- Full documentation: [test/README.md](./README.md)
- API docs: See main [README.md](../README.md)
- Logs location: `logs/app.log`

## 💡 Tips

1. **Always check logs** when debugging
2. **Use callbacks** for long-running tasks
3. **Monitor jobs** in real-time with `test:monitor`
4. **Clean up regularly** to save Redis memory
5. **Test edge cases** with custom payloads
