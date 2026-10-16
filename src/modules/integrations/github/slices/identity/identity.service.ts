import 'server-only';

import { headers } from 'next/headers';

import { getAuth, type AuthSession } from '@/shared/auth';
import { AppError, ForbiddenError, InternalError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { callGithub, getUserClient, isGithubEnabled } from '../../github-api';
import type { MyGithubAccountDto } from './identity.dto';
import { identityRepository } from './identity.repository';

const log = createLogger('github.identity');

function requireEnabled(): void {
  if (!isGithubEnabled()) throw new NotFoundError('Интеграция с GitHub не настроена');
}

/** Привязанный GitHub-аккаунт пользователя (id GitHub) или null. */
export async function getGithubIdentity(userId: string): Promise<{ githubId: string } | null> {
  const row = await identityRepository.findByUser(userId);
  log.debug({ userId, linked: row !== null }, '[github.identity] lookup');
  return row ? { githubId: row.accountId } : null;
}

/** Пользователи Tasker по id пользователей GitHub: `Map<githubId, userId>`. Непривязанные пропускаются. */
export async function findUsersByGithubIds(
  githubIds: readonly (bigint | number | string)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(githubIds.map(String))];
  if (ids.length === 0) return new Map();
  const rows = await identityRepository.findByGithubIds(ids);
  log.debug({ requested: ids.length, found: rows.length }, '[github.identity] map users');
  return new Map(rows.map((row) => [row.accountId, row.userId]));
}

/**
 * Действующий токен пользователя GitHub App (истёкший обновляет Better Auth). Без привязки или
 * при отозванном доступе — ForbiddenError: пользователь должен привязать GitHub заново.
 */
export async function getGithubUserToken(userId: string): Promise<string> {
  requireEnabled();
  const row = await identityRepository.findByUser(userId);
  if (!row) throw new ForbiddenError('Сначала привяжите GitHub в профиле');
  try {
    const tokens = await getAuth().api.getAccessToken({ body: { accountId: row.id, userId } });
    if (!tokens.accessToken) throw new Error('empty access token');
    return tokens.accessToken;
  } catch (error) {
    // Причину (ответ GitHub) не пишем: в ней могут быть данные токена.
    log.warn(
      { userId, reason: error instanceof Error ? error.name : 'unknown' },
      '[github.identity] token unavailable',
    );
    throw new ForbiddenError('Доступ к GitHub истёк — привяжите GitHub в профиле заново', {
      cause: error,
    });
  }
}

/** GitHub-аккаунт текущего пользователя для страницы профиля: логин — запросом к GitHub. */
export async function getMyGithubAccount(session: AuthSession): Promise<MyGithubAccountDto> {
  const userId = session.user.id;
  const identity = await getGithubIdentity(userId);
  if (!identity) return { linked: false };

  let login: string | null = null;
  try {
    const token = await getGithubUserToken(userId);
    const { data } = await callGithub('GET /user', { userId }, () =>
      getUserClient(token).request('GET /user'),
    );
    login = data.login;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    log.warn({ userId, code: error.code }, '[github.identity] login unavailable');
  }
  return { linked: true, githubId: identity.githubId, login };
}

/** Адрес привязки GitHub к текущему пользователю (state — в cookie, через nextCookies). */
export async function startGithubLink(session: AuthSession): Promise<string> {
  requireEnabled();
  log.debug({ userId: session.user.id }, '[github.identity] link start');
  const result = await getAuth().api.linkSocialAccount({
    body: {
      provider: 'github',
      callbackURL: '/profile/account?github=linked',
      errorCallbackURL: '/profile/account',
    },
    headers: await headers(),
  });
  if (!result.url) throw new InternalError('Better Auth не вернул адрес привязки GitHub');
  return result.url;
}

/** Отвязывает GitHub. Последний способ входа отвязать нельзя (ошибка плагина). */
export async function unlinkGithub(session: AuthSession): Promise<void> {
  const userId = session.user.id;
  const row = await identityRepository.findByUser(userId);
  if (!row) throw new NotFoundError('GitHub не привязан');
  try {
    await getAuth().api.unlinkAccount({ body: { accountId: row.id }, headers: await headers() });
  } catch (error) {
    log.warn({ userId }, '[github.identity] unlink rejected');
    throw new ForbiddenError('Нельзя отвязать единственный способ входа: сначала задайте пароль', {
      cause: error,
    });
  }
  log.info({ userId }, '[github.identity] unlinked');
}
