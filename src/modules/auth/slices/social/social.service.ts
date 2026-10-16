import 'server-only';

import { headers } from 'next/headers';

import { safeRedirectPath } from '@/shared/access';
import { getAuth } from '@/shared/auth';
import { InternalError, NotFoundError } from '@/shared/errors';
import { loadGithubAppConfig } from '@/shared/github-app';
import { createLogger } from '@/shared/logger';

import { mapAuthError } from '../credentials/credentials.errors';

const log = createLogger('auth.social');

/** Настроен ли вход через GitHub (GitHub App из GITHUB_* или созданное в админке). */
export async function isGithubSignInEnabled(): Promise<boolean> {
  return (await loadGithubAppConfig()) !== null;
}

/**
 * Начинает вход через GitHub: Better Auth кладёт state в cookie (nextCookies) и возвращает адрес
 * авторизации. Ошибки колбэка вернутся на /login?error=<код> (см. githubSignInErrorMessage).
 */
export async function startGithubSignIn(returnTo: string): Promise<string> {
  if (!(await isGithubSignInEnabled())) throw new NotFoundError('Вход через GitHub не настроен');
  const callbackURL = safeRedirectPath(returnTo);
  const errorCallbackURL =
    callbackURL === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(callbackURL)}`;
  log.debug({ returnTo: callbackURL }, '[social.github] start');

  let result: { url?: string };
  try {
    result = await getAuth().api.signInSocial({
      body: { provider: 'github', callbackURL, errorCallbackURL, newUserCallbackURL: callbackURL },
      headers: await headers(),
    });
  } catch (error) {
    log.warn('[social.github] start failed');
    throw mapAuthError(error);
  }
  if (!result.url) throw new InternalError('Better Auth не вернул адрес авторизации GitHub');
  log.info('[social.github] redirect to provider');
  return result.url;
}
