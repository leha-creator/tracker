import 'server-only';

import { App, Octokit, RequestError } from 'octokit';

import {
  AppError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors';
import { getGithubAppConfig, loadGithubAppConfig, type GithubAppConfig } from '@/shared/github-app';
import { createLogger } from '@/shared/logger';

const log = createLogger('github.api');

export type GithubApp = InstanceType<typeof App>;
export type GithubClient = InstanceType<typeof Octokit>;

/**
 * Настроено ли GitHub App: переменные GITHUB_* или приложение, созданное в админке.
 * Без него интеграция и вход через GitHub выключены. Загружает конфиг из БД (кеш на минуту).
 */
export async function isGithubEnabled(): Promise<boolean> {
  return (await loadGithubAppConfig()) !== null;
}

/** Конфиг, загруженный {@link isGithubEnabled} раньше в этом запросе; без него — «не настроена». */
function requireGithubConfig(): GithubAppConfig {
  const config = getGithubAppConfig();
  if (!config) throw new NotFoundError('Интеграция с GitHub не настроена');
  return config;
}

// Singleton через globalThis: HMR в dev не пересоздаёт экземпляр (и кеш токенов установок).
// Пересоздаётся, когда сменился конфиг (приложение создано заново в админке).
const globalForGithub = globalThis as unknown as {
  githubApp?: GithubApp;
  githubAppConfig?: GithubAppConfig;
};

/** GitHub App (ленивый): JWT приложения и кеш токенов установок — внутри Octokit. */
export function getGithubApp(): GithubApp {
  const config = requireGithubConfig();
  if (!globalForGithub.githubApp || globalForGithub.githubAppConfig !== config) {
    globalForGithub.githubApp = new App({
      appId: config.appId,
      privateKey: config.privateKey,
      oauth: { clientId: config.clientId, clientSecret: config.clientSecret },
      webhooks: { secret: config.webhookSecret },
    });
    globalForGithub.githubAppConfig = config;
    log.info({ appId: config.appId, source: config.source }, '[github] app initialized');
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
