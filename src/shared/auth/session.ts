import 'server-only';

import { headers } from 'next/headers';
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

/**
 * Текущая сессия или null. Кешируется на время одного запроса (React cache).
 * Возвращает DTO, а не объекты Better Auth.
 */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  let result: Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>;
  try {
    result = await getAuth().api.getSession({ headers: await headers() });
  } catch (error) {
    log.error({ err: error }, '[auth.getSession] failed to read session');
    throw new InternalError('Не удалось проверить сессию', { cause: error });
  }

  if (!result) {
    log.debug({ hasSession: false }, '[auth.getSession]');
    return null;
  }

  const { user, session } = result;
  log.debug({ hasSession: true, userId: user.id }, '[auth.getSession]');
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
});
