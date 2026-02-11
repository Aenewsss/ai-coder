import { createAppAuth, type AppAuthentication } from '@octokit/auth-app';
import { env } from '../config/env.js';

const auth = createAppAuth({
  appId: env.GITHUB_APP_ID,
  privateKey: env.GITHUB_APP_PRIVATE_KEY,
});

export async function getAppToken(): Promise<string> {
  const appAuth: AppAuthentication = await auth({ type: 'app' });
  return appAuth.token;
}

