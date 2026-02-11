# Integration Examples

Examples of how to integrate with the AI Coder webhook API from different languages and platforms.

## Table of Contents

- [JavaScript/TypeScript](#javascripttypescript)
- [Python](#python)
- [Go](#go)
- [curl](#curl)
- [Postman](#postman)
- [GitHub Actions](#github-actions)

## JavaScript/TypeScript

### Using Fetch API

```typescript
interface WebhookPayload {
  task: {
    description: string;
    priority: 'low' | 'normal' | 'high';
  };
  organization: {
    id: string;
    name: string;
    installationId: number;
  };
  repository: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  callback?: {
    url: string;
  };
}

async function sendTask(payload: WebhookPayload) {
  const response = await fetch('http://localhost:3000/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

// Example usage
const result = await sendTask({
  task: {
    description: 'Add unit tests for the authentication module',
    priority: 'high',
  },
  organization: {
    id: 'org_123',
    name: 'My Organization',
    installationId: 12345678,
  },
  repository: {
    owner: 'myorg',
    name: 'my-repo',
    defaultBranch: 'main',
  },
  callback: {
    url: 'https://myapp.com/webhook/callback',
  },
});

console.log('Job created:', result.jobId);
console.log('Status URL:', result.statusUrl);
```

### Using Axios

```typescript
import axios from 'axios';

async function sendTask(payload: WebhookPayload) {
  try {
    const { data } = await axios.post(
      'http://localhost:3000/webhook',
      payload
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Validation errors:', error.response?.data);
    }
    throw error;
  }
}
```

### Monitoring Job Progress

```typescript
async function monitorJob(jobId: string): Promise<void> {
  while (true) {
    const response = await fetch(`http://localhost:3000/jobs/${jobId}`);
    const data = await response.json();

    console.log(`Status: ${data.status}`);

    if (data.progress) {
      console.log(`Progress: ${data.progress.percentage}%`);
    }

    if (data.status === 'completed' || data.status === 'failed') {
      console.log('Result:', data.result);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

## Python

### Using Requests

```python
import requests
import time
from typing import Optional, Dict, Any

def send_webhook(
    description: str,
    org_id: str,
    org_name: str,
    installation_id: int,
    repo_owner: str,
    repo_name: str,
    priority: str = 'normal',
    callback_url: Optional[str] = None,
    api_url: str = 'http://localhost:3000'
) -> Dict[str, Any]:
    """Send a task to the AI Coder webhook."""

    payload = {
        'task': {
            'description': description,
            'priority': priority
        },
        'organization': {
            'id': org_id,
            'name': org_name,
            'installationId': installation_id
        },
        'repository': {
            'owner': repo_owner,
            'name': repo_name,
            'defaultBranch': 'main'
        }
    }

    if callback_url:
        payload['callback'] = {'url': callback_url}

    response = requests.post(
        f'{api_url}/webhook',
        json=payload,
        headers={'Content-Type': 'application/json'}
    )

    response.raise_for_status()
    return response.json()

def monitor_job(job_id: str, api_url: str = 'http://localhost:3000'):
    """Monitor job progress until completion."""

    while True:
        response = requests.get(f'{api_url}/jobs/{job_id}')
        data = response.json()

        print(f"Status: {data['status']}")

        if 'progress' in data:
            progress = data['progress']
            print(f"Progress: {progress['percentage']}%")

        if data['status'] in ['completed', 'failed']:
            print(f"Result: {data['result']}")
            break

        time.sleep(2)

# Example usage
if __name__ == '__main__':
    result = send_webhook(
        description='Implement user authentication with JWT',
        org_id='org_123',
        org_name='My Org',
        installation_id=12345678,
        repo_owner='myorg',
        repo_name='my-repo',
        priority='high',
        callback_url='https://myapp.com/callback'
    )

    print(f"Job ID: {result['jobId']}")
    print(f"Status URL: {result['statusUrl']}")

    # Monitor progress
    monitor_job(result['jobId'])
```

### Async Python (aiohttp)

```python
import aiohttp
import asyncio
from typing import Dict, Any

async def send_webhook_async(
    session: aiohttp.ClientSession,
    payload: Dict[str, Any],
    api_url: str = 'http://localhost:3000'
) -> Dict[str, Any]:
    """Send webhook asynchronously."""

    async with session.post(
        f'{api_url}/webhook',
        json=payload
    ) as response:
        response.raise_for_status()
        return await response.json()

async def main():
    async with aiohttp.ClientSession() as session:
        tasks = [
            send_webhook_async(session, {
                'task': {
                    'description': f'Task {i}',
                    'priority': 'normal'
                },
                'organization': {
                    'id': 'org_123',
                    'name': 'My Org',
                    'installationId': 12345678
                },
                'repository': {
                    'owner': 'myorg',
                    'name': 'my-repo',
                    'defaultBranch': 'main'
                }
            })
            for i in range(5)
        ]

        results = await asyncio.gather(*tasks)

        for result in results:
            print(f"Created job: {result['jobId']}")

asyncio.run(main())
```

## Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

type WebhookPayload struct {
    Task struct {
        Description string `json:"description"`
        Priority    string `json:"priority"`
    } `json:"task"`
    Organization struct {
        ID             string `json:"id"`
        Name           string `json:"name"`
        InstallationID int    `json:"installationId"`
    } `json:"organization"`
    Repository struct {
        Owner         string `json:"owner"`
        Name          string `json:"name"`
        DefaultBranch string `json:"defaultBranch"`
    } `json:"repository"`
    Callback *struct {
        URL string `json:"url"`
    } `json:"callback,omitempty"`
}

type WebhookResponse struct {
    JobID     string `json:"jobId"`
    Status    string `json:"status"`
    StatusURL string `json:"statusUrl"`
}

type JobStatus struct {
    Status   string `json:"status"`
    Progress *struct {
        Percentage int `json:"percentage"`
        Turn       int `json:"turn,omitempty"`
        MaxTurns   int `json:"maxTurns,omitempty"`
    } `json:"progress,omitempty"`
    Result *struct {
        Success        bool   `json:"success"`
        Message        string `json:"message"`
        PullRequestURL string `json:"pullRequestUrl,omitempty"`
        Error          string `json:"error,omitempty"`
    } `json:"result,omitempty"`
}

func sendWebhook(apiURL string, payload WebhookPayload) (*WebhookResponse, error) {
    jsonData, err := json.Marshal(payload)
    if err != nil {
        return nil, err
    }

    resp, err := http.Post(
        apiURL+"/webhook",
        "application/json",
        bytes.NewBuffer(jsonData),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusAccepted {
        body, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, body)
    }

    var result WebhookResponse
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }

    return &result, nil
}

func monitorJob(apiURL, jobID string) error {
    for {
        resp, err := http.Get(fmt.Sprintf("%s/jobs/%s", apiURL, jobID))
        if err != nil {
            return err
        }

        var status JobStatus
        if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
            resp.Body.Close()
            return err
        }
        resp.Body.Close()

        fmt.Printf("Status: %s\n", status.Status)

        if status.Progress != nil {
            fmt.Printf("Progress: %d%%\n", status.Progress.Percentage)
        }

        if status.Status == "completed" || status.Status == "failed" {
            if status.Result != nil {
                fmt.Printf("Result: %+v\n", status.Result)
            }
            break
        }

        time.Sleep(2 * time.Second)
    }

    return nil
}

func main() {
    payload := WebhookPayload{}
    payload.Task.Description = "Add authentication middleware"
    payload.Task.Priority = "high"
    payload.Organization.ID = "org_123"
    payload.Organization.Name = "My Org"
    payload.Organization.InstallationID = 12345678
    payload.Repository.Owner = "myorg"
    payload.Repository.Name = "my-repo"
    payload.Repository.DefaultBranch = "main"

    result, err := sendWebhook("http://localhost:3000", payload)
    if err != nil {
        panic(err)
    }

    fmt.Printf("Job ID: %s\n", result.JobID)
    fmt.Printf("Status URL: %s\n", result.StatusURL)

    if err := monitorJob("http://localhost:3000", result.JobID); err != nil {
        panic(err)
    }
}
```

## curl

### Basic Request

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "description": "Add unit tests for user service",
      "priority": "normal"
    },
    "organization": {
      "id": "org_123",
      "name": "My Organization",
      "installationId": 12345678
    },
    "repository": {
      "owner": "myorg",
      "name": "my-repo",
      "defaultBranch": "main"
    }
  }'
```

### With Callback

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "description": "Implement payment gateway integration",
      "priority": "high"
    },
    "organization": {
      "id": "org_123",
      "name": "My Organization",
      "installationId": 12345678
    },
    "repository": {
      "owner": "myorg",
      "name": "my-repo",
      "defaultBranch": "main"
    },
    "callback": {
      "url": "https://myapp.com/webhook/callback"
    }
  }'
```

### Check Job Status

```bash
# Get job status
curl http://localhost:3000/jobs/<jobId> | jq

# Pretty print
curl -s http://localhost:3000/jobs/<jobId> | jq '.'

# Watch job progress
watch -n 2 'curl -s http://localhost:3000/jobs/<jobId> | jq'
```

## Postman

### Setup Collection

1. Create new collection: "AI Coder API"
2. Add environment variables:
   - `base_url`: `http://localhost:3000`
   - `job_id`: (will be set from response)

### Create Webhook Request

- **Method**: POST
- **URL**: `{{base_url}}/webhook`
- **Headers**:
  - `Content-Type`: `application/json`
- **Body** (raw JSON):

```json
{
  "task": {
    "description": "{{task_description}}",
    "priority": "normal"
  },
  "organization": {
    "id": "org_123",
    "name": "My Organization",
    "installationId": 12345678
  },
  "repository": {
    "owner": "myorg",
    "name": "my-repo",
    "defaultBranch": "main"
  }
}
```

- **Tests** (to save job ID):

```javascript
const response = pm.response.json();
pm.environment.set("job_id", response.jobId);
```

### Check Job Status Request

- **Method**: GET
- **URL**: `{{base_url}}/jobs/{{job_id}}`
- **Headers**: None

## GitHub Actions

### Workflow Example

```yaml
name: AI Coder Task

on:
  issues:
    types: [labeled]

jobs:
  send-to-ai-coder:
    if: github.event.label.name == 'ai-task'
    runs-on: ubuntu-latest

    steps:
      - name: Send task to AI Coder
        run: |
          RESPONSE=$(curl -X POST ${{ secrets.AI_CODER_URL }}/webhook \
            -H "Content-Type: application/json" \
            -d '{
              "task": {
                "description": "${{ github.event.issue.body }}",
                "priority": "normal"
              },
              "organization": {
                "id": "${{ github.repository_owner_id }}",
                "name": "${{ github.repository_owner }}",
                "installationId": ${{ secrets.GITHUB_APP_INSTALLATION_ID }}
              },
              "repository": {
                "owner": "${{ github.repository_owner }}",
                "name": "${{ github.event.repository.name }}",
                "defaultBranch": "${{ github.event.repository.default_branch }}"
              },
              "callback": {
                "url": "${{ secrets.CALLBACK_URL }}"
              }
            }')

          JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
          echo "Created job: $JOB_ID"

          # Add comment to issue
          gh issue comment ${{ github.event.issue.number }} \
            --body "AI Coder task created: $JOB_ID"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Best Practices

1. **Always include error handling**
2. **Use callbacks for long-running tasks**
3. **Implement retry logic for network failures**
4. **Validate payloads before sending**
5. **Store job IDs for tracking**
6. **Set appropriate timeouts**
7. **Log all webhook interactions**

## Rate Limiting

The API has rate limiting:
- Max 10 jobs per minute
- Jobs are queued if limit exceeded
- High priority jobs are processed first

Handle rate limiting in your code:

```typescript
async function sendWithRetry(payload: WebhookPayload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendTask(payload);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
    }
  }
}
```
