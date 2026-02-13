import { Redis } from 'ioredis';
import { redisConnection } from '../jobs/queue.js';
import { Message } from '../llm/types.js';
import { logger } from '../utils/logger.js';

export interface AgentCheckpoint {
  jobId: string;
  workspaceId: string;
  taskDescription: string;
  messages: Message[];
  turns: number;
  maxTurns: number;
  selectedModel?: string;
  workspaceConfig: {
    owner: string;
    repo: string;
    defaultBranch: string;
  };
  lastUpdated: string;
  version: number; // Para versionamento do checkpoint
}

export interface CheckpointMetadata {
  totalCheckpoints: number;
  lastCheckpointAt: string;
  canResume: boolean;
}

const CHECKPOINT_PREFIX = 'agent:checkpoint:';
const CHECKPOINT_TTL = 7 * 24 * 60 * 60; // 7 dias em segundos
const CHECKPOINT_VERSION = 1;

export class CheckpointManager {
  private redis: Redis;
  private log = logger.child({ component: 'CheckpointManager' });

  constructor(redis: Redis = redisConnection) {
    this.redis = redis;
  }

  /**
   * Salva um checkpoint do estado atual do agente
   */
  async saveCheckpoint(checkpoint: Omit<AgentCheckpoint, 'lastUpdated' | 'version'>): Promise<void> {
    const key = this.getCheckpointKey(checkpoint.jobId);

    const fullCheckpoint: AgentCheckpoint = {
      ...checkpoint,
      lastUpdated: new Date().toISOString(),
      version: CHECKPOINT_VERSION,
    };

    try {
      await this.redis.setex(
        key,
        CHECKPOINT_TTL,
        JSON.stringify(fullCheckpoint)
      );

      this.log.debug(
        {
          jobId: checkpoint.jobId,
          turns: checkpoint.turns,
          messageCount: checkpoint.messages.length
        },
        'Checkpoint saved'
      );
    } catch (error) {
      this.log.error(
        { error, jobId: checkpoint.jobId },
        'Failed to save checkpoint'
      );
      // Não lançamos erro para não interromper o agente
    }
  }

  /**
   * Carrega o checkpoint mais recente para um job
   */
  async loadCheckpoint(jobId: string): Promise<AgentCheckpoint | null> {
    const key = this.getCheckpointKey(jobId);

    try {
      const data = await this.redis.get(key);

      if (!data) {
        this.log.debug({ jobId }, 'No checkpoint found');
        return null;
      }

      const checkpoint = JSON.parse(data) as AgentCheckpoint;

      // Validação de versão
      if (checkpoint.version !== CHECKPOINT_VERSION) {
        this.log.warn(
          { jobId, checkpointVersion: checkpoint.version, currentVersion: CHECKPOINT_VERSION },
          'Checkpoint version mismatch, ignoring'
        );
        return null;
      }

      this.log.info(
        {
          jobId,
          turns: checkpoint.turns,
          messageCount: checkpoint.messages.length,
          lastUpdated: checkpoint.lastUpdated
        },
        'Checkpoint loaded'
      );

      return checkpoint;
    } catch (error) {
      this.log.error(
        { error, jobId },
        'Failed to load checkpoint'
      );
      return null;
    }
  }

  /**
   * Remove o checkpoint de um job
   */
  async deleteCheckpoint(jobId: string): Promise<void> {
    const key = this.getCheckpointKey(jobId);

    try {
      await this.redis.del(key);
      this.log.debug({ jobId }, 'Checkpoint deleted');
    } catch (error) {
      this.log.error(
        { error, jobId },
        'Failed to delete checkpoint'
      );
    }
  }

  /**
   * Verifica se existe um checkpoint para retomar
   */
  async hasCheckpoint(jobId: string): Promise<boolean> {
    const key = this.getCheckpointKey(jobId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Obtém metadados sobre o checkpoint
   */
  async getCheckpointMetadata(jobId: string): Promise<CheckpointMetadata | null> {
    const checkpoint = await this.loadCheckpoint(jobId);

    if (!checkpoint) {
      return null;
    }

    return {
      totalCheckpoints: checkpoint.turns,
      lastCheckpointAt: checkpoint.lastUpdated,
      canResume: true,
    };
  }

  /**
   * Lista todos os jobs com checkpoints ativos
   */
  async listActiveCheckpoints(): Promise<string[]> {
    try {
      const pattern = `${CHECKPOINT_PREFIX}*`;
      const keys = await this.redis.keys(pattern);

      return keys.map(key => key.replace(CHECKPOINT_PREFIX, ''));
    } catch (error) {
      this.log.error({ error }, 'Failed to list checkpoints');
      return [];
    }
  }

  private getCheckpointKey(jobId: string): string {
    return `${CHECKPOINT_PREFIX}${jobId}`;
  }
}

// Singleton instance
export const checkpointManager = new CheckpointManager();
