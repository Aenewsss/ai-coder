import { logger } from '../utils/logger.js';

export interface CallbackPayload {
  jobId: string;
  status: 'completed' | 'failed';
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  error?: string;
  completedAt: string;
}

export async function sendCallback(
  callbackUrl: string,
  payload: CallbackPayload
): Promise<boolean> {
  const log = logger.child({ jobId: payload.jobId, callbackUrl });

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Coder/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      log.warn(
        { statusCode: response.status, statusText: response.statusText },
        'Callback request failed'
      );
      return false;
    }

    log.info('Callback sent successfully');
    return true;
  } catch (error) {
    log.error({ error: error instanceof Error ? error.message : String(error) }, 'Callback request error');
    return false;
  }
}
