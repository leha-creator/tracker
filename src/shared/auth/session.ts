import 'server-only';

import { headers } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';

import { parseGlobalRole, type GlobalRole } from '@/shared/access/global-role';
import { InternalError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { getAuth } from './auth';

const log = createLogger('auth');

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: GlobalRole;
  banned: boolean;
}

export interface AuthSession {
  user: AuthUser;
  session: { id: string; expiresAt: Date };
}

type SessionResult = Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>;

function toAuthSession({ user, session }: NonNullable<SessionResult>): AuthSession {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role: parseGlobalRole(user.role),
      banned: user.banned ?? false,
    },
    session: { id: session.id, expiresAt: session.expiresAt },
  };
}

async function readSession(
  scope: 'auth.getSession' | 'auth.getFreshSession',
  disableCookieCache: boolean,
): Promise<AuthSession | null> {
  // Вне try: при пререндере Next.js прерывает эти вызовы штатно, это не ошибка сессии.
  // connection() — потому что Better Auth сравнивает срок сессии с Date.now(), а это
  // запрещено в статическом пререндере Cache Components.
  await connection();
  const requestHeaders = await headers();
  let result: SessionResult;
  try {
    result = await getAuth().api.getSession({
      headers: requestHeaders,
      ...(disableCookieCache ? { query: { disableCookieCache: true } } : {}),
    });
  } catch (error) {
    log.error({ err: error }, `[${scope}] failed to read session`);
    throw new InternalError('Не удалось проверить сессию', { cause: error });
  }

  if (!result) {
    log.debug({ hasSession: false }, `[${scope}]`);
    return null;
  }

  log.debug({ hasSession: true, userId: result.user.id }, `[${scope}]`);
  return toAuthSession(result);
}

/**
 * Текущая сессия или null. Кешируется на время одного запроса (React cache).
 * Возвращает DTO, а не объекты Better Auth. Данные могут прийти из cookie-кеша сессии
 * (до 5 минут), поэтому блокировка и смена роли видны не сразу.
 */
export const getSession = cache((): Promise<AuthSession | null> =>
  readSession('auth.getSession', false),
);

/**
 * Сессия из БД в обход cookie-кеша: блокировка и смена роли видны сразу.
 * Для проверок администратора — это лишнее обращение к БД на запрос.
 */
export const getFreshSession = cache((): Promise<AuthSession | null> =>
  readSession('auth.getFreshSession', true),
);
