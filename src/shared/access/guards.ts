import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getFreshSession, getSession, type AuthSession } from '@/shared/auth';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { isAdmin } from './global-role';
import { safeRedirectPath } from './safe-redirect';

const log = createLogger('access');

type ReadSession = () => Promise<AuthSession | null>;

async function requireActiveSession(read: ReadSession, scope: string): Promise<AuthSession> {
  const session = await read();
  if (!session) {
    log.warn(`[${scope}] unauthenticated`);
    throw new UnauthorizedError();
  }
  if (session.user.banned) {
    log.warn({ userId: session.user.id }, `[${scope}] banned user`);
    throw new ForbiddenError('Учётная запись заблокирована');
  }
  // Вторая линия обороны: сессию агенту не выдаёт хук Better Auth (agent-session-guard).
  if (session.user.isAgent) {
    log.warn({ userId: session.user.id }, `[${scope}] agent session rejected`);
    throw new ForbiddenError('Агент не может работать в интерфейсе');
  }
  return session;
}

async function requireSessionOrRedirect(
  read: ReadSession,
  scope: string,
  returnTo?: string,
): Promise<AuthSession> {
  const session = await read();
  if (!session || session.user.banned || session.user.isAgent) {
    const target = safeRedirectPath(returnTo, '');
    log.debug({ returnTo: target }, `[${scope}] redirect to login`);
    redirect(target ? `/login?returnTo=${encodeURIComponent(target)}` : '/login');
  }
  return session;
}

/** Требует вход. Для сервисов и Server Actions: бросает доменные ошибки. */
export async function requireUser(): Promise<AuthSession> {
  const session = await requireActiveSession(getSession, 'access.requireUser');
  log.debug({ userId: session.user.id }, '[access.requireUser]');
  return session;
}

/**
 * Требует глобальную роль admin. Сессия читается в обход cookie-кеша: снятая роль
 * или блокировка действуют сразу.
 */
export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireActiveSession(getFreshSession, 'access.requireAdmin');
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
  return requireSessionOrRedirect(getSession, 'access.requireUserOrRedirect', returnTo);
}

/**
 * Для страниц админки: не-администратору отдаём 404, не раскрывая существование раздела.
 * Сессия — в обход cookie-кеша, как в requireAdmin.
 */
export async function requireAdminOrNotFound(returnTo?: string): Promise<AuthSession> {
  const session = await requireSessionOrRedirect(
    getFreshSession,
    'access.requireAdminOrNotFound',
    returnTo,
  );
  if (!isAdmin(session.user)) {
    log.warn(
      { userId: session.user.id, role: session.user.role },
      '[access.requireAdminOrNotFound] forbidden',
    );
    notFound();
  }
  return session;
}

/**
 * Запрещает действие под входом администратора от имени пользователя: смену пароля, 2FA,
 * завершение сессий, выпуск токенов, привязку GitHub — то, что меняет доступ к учётной записи
 * или продлевает его за пределы часа имперсонации.
 */
export function requireNotImpersonating(session: AuthSession, scope = 'access'): void {
  const impersonatedBy = session.session?.impersonatedBy;
  if (!impersonatedBy) return;
  log.warn({ userId: session.user.id, impersonatedBy }, `[${scope}] rejected under impersonation`);
  throw new ForbiddenError('Недоступно при входе от имени пользователя');
}
