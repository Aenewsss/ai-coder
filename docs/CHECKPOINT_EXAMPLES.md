# Exemplos de Uso do Sistema de Checkpoints

## Cenário 1: Job Falha por Rate Limit

### 1. Criar um job que falha

```bash
# Enviar webhook para criar job
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issue_comment" \
  -d '{
    "action": "created",
    "installation": {
      "id": 12345
    },
    "repository": {
      "owner": {
        "login": "my-org"
      },
      "name": "my-repo",
      "default_branch": "main"
    },
    "issue": {
      "number": 42
    },
    "comment": {
      "body": "/code Add comprehensive error handling to the API"
    }
  }'
```

### 2. Monitorar o job

```bash
# Assumindo que o job ID retornado é "123"
npm run test:monitor 123
```

### 3. Job falha após 5 turns (rate limit da API)

```
❌ Job failed: API rate limit exceeded
```

### 4. Verificar se há checkpoint

```bash
# Listar todos os checkpoints
npm run test:checkpoints

# Ou inspecionar checkpoint específico
npm run test:inspect 123
```

Saída esperada:
```
📋 Checkpoint Information:
   Job ID: 123
   Status: failed
   Turns: 5/10 (50%)
   Messages: 12
   Can Resume: ✅ Yes
```

### 5. Retomar execução

```bash
npm run test:resume 123
```

Saída:
```
🎉 Job resumed successfully!
   Original Job ID: 123
   New Job ID: 456
   Resuming from turn: 5
```

### 6. Novo job continua de onde parou

O novo job (456) carrega o histórico completo e continua do turn 6.

---

## Cenário 2: Crash do Servidor

### 1. Job está executando

```bash
npm run test:monitor 789
```

Saída:
```
Job 789 is active
Turn: 3/10
```

### 2. Servidor cai (ctrl+C)

```
^C Server shut down
```

### 3. Reiniciar servidor

```bash
npm run dev
npm run dev:worker
```

### 4. Listar checkpoints órfãos

```bash
npm run test:checkpoints
```

Saída:
```
Found 1 checkpoint(s):

📋 Job ID: 789
   Status: unknown
   Turns: 3/10
   Messages: 8
   Last Updated: 2024-01-15 10:30:45
   Can Resume: ✅ Yes
```

### 5. Retomar jobs interrompidos

```bash
npm run test:resume 789
```

---

## Cenário 3: Debug de Job Complexo

### 1. Job está executando uma tarefa complexa

```bash
npm run test:monitor 999
```

### 2. Inspecionar progresso detalhado

```bash
# Inspeção básica
npm run test:inspect 999

# Inspeção completa com histórico de mensagens
npm run test:inspect 999 --verbose
```

Saída verbose mostra:
```
📜 Full Message History:

--- Message 1 (user) ---
Please add comprehensive error handling to the API

--- Message 2 (assistant) ---
[text] I'll analyze the codebase and add error handling...

--- Message 3 (assistant) ---
[tool_use] search_code - ID: tool-abc123
  Input: {"query":"try catch","file_type":"ts"}...

--- Message 4 (user) ---
[tool_result] ID: tool-abc123
  Result: Found 15 files with error handling...

--- Message 5 (assistant) ---
[text] I found several files. Let me read the main API...
```

### 3. Identificar problema

Ao revisar o histórico, você percebe que o agente está procurando nos arquivos errados.

### 4. Parar job e ajustar

```bash
# O job eventualmente falha ou atinge max turns
# Ajustar código ou prompt se necessário
# Retomar se ainda faz sentido, ou criar novo job
```

---

## Cenário 4: Uso Programático

### Verificar e retomar via código

```typescript
import { checkpointManager } from './src/agent/checkpoint.js';
import { jobQueue, getJobStatus } from './src/jobs/queue.js';

// Função para auto-retomar jobs falhados
async function autoResumeFailedJobs() {
  const checkpoints = await checkpointManager.listActiveCheckpoints();

  for (const jobId of checkpoints) {
    const jobStatus = await getJobStatus(jobId);

    // Só retoma se falhou
    if (jobStatus.status === 'failed') {
      const checkpoint = await checkpointManager.loadCheckpoint(jobId);

      if (!checkpoint) continue;

      // Verificar se ainda tem turns disponíveis
      if (checkpoint.turns < checkpoint.maxTurns) {
        console.log(`Auto-resuming failed job ${jobId}...`);

        const originalJob = await jobQueue.getJob(jobId);
        if (!originalJob) continue;

        // Criar novo job
        const newJob = await jobQueue.add('process-task', {
          ...originalJob.data,
          _resume: {
            fromJobId: jobId,
            resumedAt: new Date().toISOString(),
          },
        });

        console.log(`Created new job ${newJob.id} from checkpoint`);
      }
    }
  }
}

// Executar a cada 5 minutos
setInterval(autoResumeFailedJobs, 5 * 60 * 1000);
```

### Monitoramento customizado

```typescript
import { checkpointManager } from './src/agent/checkpoint.js';

// Verificar saúde dos checkpoints
async function checkCheckpointHealth() {
  const checkpoints = await checkpointManager.listActiveCheckpoints();

  const stats = {
    total: checkpoints.length,
    oldCheckpoints: 0,
    nearMaxTurns: 0,
  };

  for (const jobId of checkpoints) {
    const checkpoint = await checkpointManager.loadCheckpoint(jobId);
    if (!checkpoint) continue;

    // Checkpoint com mais de 1 hora
    const age = Date.now() - new Date(checkpoint.lastUpdated).getTime();
    if (age > 60 * 60 * 1000) {
      stats.oldCheckpoints++;
    }

    // Checkpoint perto do max turns
    if (checkpoint.turns >= checkpoint.maxTurns * 0.9) {
      stats.nearMaxTurns++;
    }
  }

  return stats;
}
```

---

## Cenário 5: API REST

### Via curl

```bash
# Listar todos os checkpoints
curl http://localhost:3000/checkpoints

# Verificar checkpoint específico
curl http://localhost:3000/checkpoints/123

# Verificar se pode retomar
curl http://localhost:3000/checkpoints/123/can-resume

# Retomar job
curl -X POST http://localhost:3000/checkpoints/123/resume \
  -H "Content-Type: application/json" \
  -d '{
    "callback": {
      "url": "https://your-webhook.com/callback"
    }
  }'

# Deletar checkpoint
curl -X DELETE http://localhost:3000/checkpoints/123
```

### Via JavaScript/TypeScript

```typescript
// Cliente para API de checkpoints
class CheckpointClient {
  constructor(private baseUrl: string) {}

  async listCheckpoints() {
    const response = await fetch(`${this.baseUrl}/checkpoints`);
    return response.json();
  }

  async getCheckpoint(jobId: string) {
    const response = await fetch(`${this.baseUrl}/checkpoints/${jobId}`);
    return response.json();
  }

  async canResume(jobId: string) {
    const response = await fetch(`${this.baseUrl}/checkpoints/${jobId}/can-resume`);
    return response.json();
  }

  async resume(jobId: string, callbackUrl?: string) {
    const response = await fetch(`${this.baseUrl}/checkpoints/${jobId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback: callbackUrl ? { url: callbackUrl } : undefined
      })
    });
    return response.json();
  }

  async delete(jobId: string) {
    const response = await fetch(`${this.baseUrl}/checkpoints/${jobId}`, {
      method: 'DELETE'
    });
    return response.json();
  }
}

// Uso
const client = new CheckpointClient('http://localhost:3000');

// Verificar e retomar automaticamente
const checkpoints = await client.listCheckpoints();

for (const checkpoint of checkpoints.checkpoints) {
  if (checkpoint.jobStatus === 'failed') {
    const canResume = await client.canResume(checkpoint.jobId);

    if (canResume.canResume) {
      await client.resume(checkpoint.jobId, 'https://my-callback.com/webhook');
      console.log(`Resumed job ${checkpoint.jobId}`);
    }
  }
}
```

---

## Cenário 6: Integração com CI/CD

### GitHub Actions

```yaml
name: Resume Failed AI Jobs

on:
  schedule:
    # Executar a cada hora
    - cron: '0 * * * *'

jobs:
  resume-jobs:
    runs-on: ubuntu-latest
    steps:
      - name: Check for failed jobs
        run: |
          CHECKPOINTS=$(curl -s http://your-server/checkpoints)
          echo "$CHECKPOINTS" | jq -r '.checkpoints[] | select(.jobStatus == "failed") | .jobId' | while read jobId; do
            echo "Resuming job $jobId"
            curl -X POST http://your-server/checkpoints/$jobId/resume \
              -H "Content-Type: application/json" \
              -d '{"callback": {"url": "${{ secrets.CALLBACK_URL }}"}}'
          done
```

---

## Cenário 7: Limpeza de Checkpoints

### Limpeza manual de checkpoints antigos

```bash
# Script para limpar checkpoints de jobs completados
curl http://localhost:3000/checkpoints | jq -r '.checkpoints[] | select(.jobStatus == "completed") | .jobId' | while read jobId; do
  echo "Deleting checkpoint for completed job $jobId"
  curl -X DELETE http://localhost:3000/checkpoints/$jobId
done
```

### Limpeza programática

```typescript
import { checkpointManager } from './src/agent/checkpoint.js';
import { getJobStatus } from './src/jobs/queue.js';

async function cleanupOldCheckpoints() {
  const checkpoints = await checkpointManager.listActiveCheckpoints();

  for (const jobId of checkpoints) {
    const checkpoint = await checkpointManager.loadCheckpoint(jobId);
    if (!checkpoint) continue;

    // Deletar checkpoints com mais de 24h
    const age = Date.now() - new Date(checkpoint.lastUpdated).getTime();
    const oneDayInMs = 24 * 60 * 60 * 1000;

    if (age > oneDayInMs) {
      const jobStatus = await getJobStatus(jobId);

      // Só deletar se job já completou
      if (jobStatus.status === 'completed') {
        await checkpointManager.deleteCheckpoint(jobId);
        console.log(`Deleted old checkpoint for job ${jobId}`);
      }
    }
  }
}
```

---

## Dicas de Uso

### ✅ Boas Práticas

1. **Monitore regularmente**
   ```bash
   # Adicione ao crontab
   */15 * * * * npm run test:checkpoints
   ```

2. **Configure alertas**
   - Alerte quando checkpoints ficarem órfãos por muito tempo
   - Monitore taxa de falhas vs. retomadas

3. **Mantenha callbacks atualizados**
   - Sempre passe callback ao retomar para rastrear conclusão

4. **Use inspeção para debug**
   - Use `--verbose` para ver todo o histórico de mensagens
   - Identifique padrões de falha

### ❌ Evite

1. **Não retome jobs completados**
   - Sempre verifique `can-resume` antes

2. **Não acumule checkpoints**
   - Configure limpeza automática

3. **Não ignore erros persistentes**
   - Se um job falha mesmo após retomar, investigue a causa raiz
