# Sistema de Checkpoints do Agente

## Visão Geral

O sistema de checkpoints permite que o agente salve seu estado periodicamente durante a execução de uma tarefa. Se a sessão cair, travar ou parar por qualquer motivo, você pode retomar de onde parou sem perder o progresso.

## Como Funciona

### Salvamento Automático

O agente salva automaticamente um checkpoint:
- **Após cada resposta da LLM** - Garante que o raciocínio mais recente seja preservado
- **Após a execução de ferramentas** - Salva os resultados das ações realizadas

### O Que é Salvo

Cada checkpoint contém:
- **Histórico completo de mensagens** - Toda a conversação entre usuário e agente
- **Número de turns executados** - Para continuar do ponto correto
- **Modelo selecionado** - Mantém consistência na execução
- **Configuração do workspace** - Owner, repo, branch padrão
- **Conteúdo de raciocínio** - Para modelos que suportam thinking mode (DeepSeek)
- **Timestamp** - Quando foi salvo pela última vez

### Armazenamento

Os checkpoints são armazenados no **Redis** com:
- **TTL de 7 dias** - Limpeza automática após esse período
- **Chave única por job** - `agent:checkpoint:{jobId}`
- **Formato JSON** - Fácil inspeção e debug

## API Endpoints

### 1. Verificar Checkpoint

```bash
GET /checkpoints/:jobId
```

Retorna metadados do checkpoint:
```json
{
  "jobId": "123",
  "metadata": {
    "totalCheckpoints": 5,
    "lastCheckpointAt": "2024-01-15T10:30:00Z",
    "canResume": true
  }
}
```

### 2. Verificar se Pode Retomar

```bash
GET /checkpoints/:jobId/can-resume
```

Verifica se um job pode ser retomado:
```json
{
  "jobId": "123",
  "canResume": true,
  "hasCheckpoint": true,
  "jobStatus": "failed"
}
```

### 3. Retomar Execução

```bash
POST /checkpoints/:jobId/resume
Content-Type: application/json

{
  "callback": {
    "url": "https://your-webhook.com/callback"
  }
}
```

Cria um novo job que continua de onde o anterior parou:
```json
{
  "message": "Job resumed from checkpoint",
  "originalJobId": "123",
  "newJobId": "456",
  "resumedFrom": {
    "turns": 5,
    "messageCount": 12,
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

### 4. Listar Checkpoints Ativos

```bash
GET /checkpoints
```

Lista todos os checkpoints disponíveis:
```json
{
  "total": 3,
  "checkpoints": [
    {
      "jobId": "123",
      "metadata": {
        "totalCheckpoints": 5,
        "lastCheckpointAt": "2024-01-15T10:30:00Z",
        "canResume": true
      },
      "jobStatus": "failed"
    }
  ]
}
```

### 5. Deletar Checkpoint

```bash
DELETE /checkpoints/:jobId
```

Remove manualmente um checkpoint:
```json
{
  "message": "Checkpoint deleted successfully",
  "jobId": "123"
}
```

## Uso Programático

### Verificar e Retomar via Código

```typescript
import { checkpointManager } from './agent/checkpoint.js';
import { jobQueue } from './jobs/queue.js';

// Verificar se existe checkpoint
const hasCheckpoint = await checkpointManager.hasCheckpoint(jobId);

if (hasCheckpoint) {
  // Carregar checkpoint
  const checkpoint = await checkpointManager.loadCheckpoint(jobId);

  console.log(`Job pode retomar do turn ${checkpoint.turns}`);
  console.log(`Último salvamento: ${checkpoint.lastUpdated}`);

  // Retomar criando novo job
  const originalJob = await jobQueue.getJob(jobId);
  const newJob = await jobQueue.add('process-task', {
    ...originalJob.data,
    _resume: {
      fromJobId: jobId,
      resumedAt: new Date().toISOString()
    }
  });
}
```

### Listar Jobs que Podem ser Retomados

```typescript
import { checkpointManager } from './agent/checkpoint.js';
import { getJobStatus } from './jobs/queue.js';

const activeCheckpoints = await checkpointManager.listActiveCheckpoints();

for (const jobId of activeCheckpoints) {
  const jobStatus = await getJobStatus(jobId);

  if (jobStatus.status === 'failed') {
    console.log(`Job ${jobId} falhou e pode ser retomado`);
  }
}
```

## Cenários de Uso

### 1. Falha de API (Rate Limit, Timeout)

Se a API do LLM falhar após várias tentativas:
1. O job é marcado como falho
2. O checkpoint permanece no Redis
3. Retome via `POST /checkpoints/:jobId/resume`
4. Continua do último turn bem-sucedido

### 2. Crash do Servidor

Se o servidor cair durante a execução:
1. O checkpoint mais recente fica no Redis
2. Reinicie o servidor
3. Liste checkpoints ativos
4. Retome os jobs interrompidos

### 3. Debugging

Para inspecionar o estado do agente:
1. Busque o checkpoint via API
2. Analise o histórico de mensagens
3. Veja quais ferramentas foram executadas
4. Identifique onde o problema ocorreu

### 4. Interrupção Manual

Se precisar parar um job intencionalmente:
1. Pare o job (ele salvou checkpoints durante execução)
2. Faça ajustes necessários (código, configs, etc)
3. Retome de onde parou

## Limpeza Automática

Checkpoints são automaticamente removidos:
- ✅ **Quando o job completa com sucesso** - Não precisa mais do checkpoint
- ✅ **Após 7 dias** - TTL do Redis expira automaticamente
- ✅ **Quando deletado manualmente** - Via API DELETE

## Boas Práticas

### ✅ Fazer

- Monitorar checkpoints ativos regularmente
- Retomar jobs falhados rapidamente (antes do TTL expirar)
- Usar callbacks para ser notificado de falhas
- Inspecionar checkpoints para debug

### ❌ Evitar

- Deletar checkpoints de jobs que ainda podem ser retomados
- Retomar jobs que já completaram com sucesso
- Esperar mais de 7 dias para retomar (checkpoint expira)

## Limitações

1. **Workspace efêmero** - O workspace local é recriado ao retomar, mudanças locais são perdidas
2. **Estado externo** - Ações já executadas (PRs criados, commits feitos) não são desfeitas
3. **Versionamento** - Checkpoints de versões antigas podem ser incompatíveis

## Monitoramento

### Script de Monitoramento

```bash
# Listar todos os checkpoints ativos
curl http://localhost:3000/checkpoints

# Verificar job específico
curl http://localhost:3000/checkpoints/123/can-resume

# Retomar job
curl -X POST http://localhost:3000/checkpoints/123/resume \
  -H "Content-Type: application/json" \
  -d '{"callback": {"url": "https://webhook.site/your-url"}}'
```

### Logs

O sistema registra:
- Quando checkpoints são salvos
- Quando jobs são retomados
- Erros ao salvar/carregar checkpoints

Exemplo:
```json
{
  "level": "info",
  "component": "CheckpointManager",
  "jobId": "123",
  "turns": 5,
  "messageCount": 12,
  "msg": "Checkpoint saved"
}
```

## Troubleshooting

### Checkpoint não encontrado

**Causa**: Expirou (7 dias) ou foi deletado
**Solução**: Criar novo job do zero

### Não consegue retomar

**Causa**: Job ainda está ativo
**Solução**: Aguardar falha ou cancelar job primeiro

### Checkpoint corrompido

**Causa**: Versão incompatível ou erro no Redis
**Solução**: Deletar checkpoint e criar novo job

## Futuras Melhorias

- [ ] Compressão de checkpoints grandes
- [ ] Múltiplos checkpoints por job (histórico)
- [ ] Retry automático usando checkpoints
- [ ] Dashboard web para gerenciar checkpoints
- [ ] Exportar/importar checkpoints
