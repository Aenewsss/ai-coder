import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { GitHubError } from '../utils/errors.js';

interface InstallationToken {
  token: string;
  expiresAt: Date;
}

const tokenCache = new Map<number, InstallationToken>();

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);

  // Return cached token if it's still valid (with 5 minute buffer)
  if (cached && cached.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return cached.token;
  }

  try {
    const auth = createAppAuth({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    });

    const installationAuth = await auth({ type: 'installation' });

    const expiresAt = new Date(installationAuth.expiresAt || Date.now() + 60 * 60 * 1000);

    tokenCache.set(installationId, {
      token: installationAuth.token,
      expiresAt,
    });

    logger.debug({ installationId }, 'Refreshed installation token');

    return installationAuth.token;
  } catch (error) {
    throw new GitHubError(`Failed to get installation token: ${error instanceof Error ? error.message : String(error)}`, {
      installationId,
    });
  }
}

export function clearTokenCache(installationId?: number): void {
  if (installationId) {
    tokenCache.delete(installationId);
  } else {
    tokenCache.clear();
  }
}
