import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getSession, type AuthSession } from '@/shared/auth';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { isAdmin } from './global-role';
import { safeRedirectPath } from './safe-redirect';

const log = createLogger('access');

/** Требует вход. Для сервисов и Server Actions: бросает доменные ошибки. */
export async function requireUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    log.warn('[access.requireUser] unauthenticated');
    throw new UnauthorizedError();
  }
  if (session.user.banned) {
    log.warn({ userId: session.user.id }, '[access.requireUser] banned user');
    throw new ForbiddenError('Учётная запись заблокирована');
  }
  log.debug({ userId: session.user.id }, '[access.requireUser]');
  return session;
}

/** Требует глобальную роль admin. */
export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireUser();
  if (!isAdmin(session.user)) {
    log.warn(
      { userId: session.user.id, role: session.user.role },
      '[access.requireAdmin] forbidden',
    );
    throw new ForbiddenError();
  }
  log.debug({ userId: session.user.id }, '[access.requireAdmin]');
  return session;
}

/** Для страниц: без сессии — редирект на вход с возвратом на исходный путь. */
export async function requireUserOrRedirect(returnTo?: string): Promise<AuthSession> {
  const session = await getSession();
  if (!session || session.user.banned) {
    const target = safeRedirectPath(returnTo, '');
    log.debug({ returnTo: target }, '[access.requireUserOrRedirect] redirect to login');
    redirect(target ? `/login?returnTo=${encodeURIComponent(target)}` : '/login');
  }
  return session;
}

/** Для страниц админки: не-администратору отдаём 404, не раскрывая существование раздела. */
export async function requireAdminOrNotFound(): Promise<AuthSession> {
  const session = await requireUserOrRedirect();
  if (!isAdmin(session.user)) {
    log.warn(
      { userId: session.user.id, role: session.user.role },
      '[access.requireAdminOrNotFound] forbidden',
    );
    notFound();
  }
  return session;
}
