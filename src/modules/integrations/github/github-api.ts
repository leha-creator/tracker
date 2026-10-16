import 'server-only';

import { App, Octokit, RequestError } from 'octokit';

import { getEnv } from '@/shared/env';
import {
  AppError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('github.api');

export type GithubApp = InstanceType<typeof App>;
export type GithubClient = InstanceType<typeof Octokit>;

/** Заданы ли все переменные GITHUB_* (иначе интеграция и вход через GitHub выключены). */
export function isGithubEnabled(): boolean {
  return getEnv().GITHUB_ENABLED;
}

function requireGithubConfig() {
  const env = getEnv();
  const {
    GITHUB_APP_ID: appId,
    GITHUB_APP_SLUG: slug,
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_APP_CLIENT_ID: clientId,
    GITHUB_APP_CLIENT_SECRET: clientSecret,
    GITHUB_WEBHOOK_SECRET: webhookSecret,
  } = env;
  if (!appId || !slug || !privateKey || !clientId || !clientSecret || !webhookSecret) {
    throw new NotFoundError('Интеграция с GitHub не настроена');
  }
  return { appId, slug, privateKey, clientId, clientSecret, webhookSecret };
}

// Singleton через globalThis: HMR в dev не пересоздаёт экземпляр (и кеш токенов установок).
const globalForGithub = globalThis as unknown as { githubApp?: GithubApp };

/** GitHub App (ленивый): JWT приложения и кеш токенов установок — внутри Octokit. */
export function getGithubApp(): GithubApp {
  if (!globalForGithub.githubApp) {
    const config = requireGithubConfig();
    globalForGithub.githubApp = new App({
      appId: config.appId,
      privateKey: config.privateKey,
      oauth: { clientId: config.clientId, clientSecret: config.clientSecret },
      webhooks: { secret: config.webhookSecret },
    });
    log.info({ appId: config.appId }, '[github] app initialized');
  }
  return globalForGithub.githubApp;
}

/** Клиент от имени установки (репозитории, PR). Токен установки кешируется Octokit. */
export function getInstallationClient(installationId: number): Promise<GithubClient> {
  return getGithubApp().getInstallationOctokit(installationId);
}

/** Клиент от имени пользователя (его токен GitHub App из привязанного аккаунта). */
export function getUserClient(accessToken: string): GithubClient {
  return new Octokit({ auth: accessToken });
}

/** Ссылка установки приложения; `state` вернётся на Setup URL. */
export function githubInstallUrl(state: string): string {
  const { slug } = requireGithubConfig();
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

/** Ошибка Octokit → доменная. Тело ответа GitHub не логируется и не показывается. */
export function mapGithubError(
  error: unknown,
  route: string,
  context: Record<string, unknown> = {},
): AppError {
  if (error instanceof AppError) return error;
  const status = error instanceof RequestError ? error.status : undefined;
  log.error({ route, status, ...context }, '[github.api] failed');
  switch (status) {
    case 404:
      return new NotFoundError('Не найдено на GitHub', { cause: error });
    case 401:
    case 403:
      return new ForbiddenError('Нет доступа к GitHub', { cause: error });
    case 422:
      return new ValidationError('GitHub отклонил запрос', { cause: error });
    default:
      return new InternalError('Сбой запроса к GitHub', { cause: error });
  }
}

/** Вызов GitHub API с логированием и переводом ошибок. `route` — для логов (`GET /user/installations`). */
export async function callGithub<T>(
  route: string,
  context: Record<string, unknown>,
  call: () => Promise<T>,
): Promise<T> {
  log.debug({ route, ...context }, '[github.api] request');
  try {
    return await call();
  } catch (error) {
    throw mapGithubError(error, route, context);
  }
}
