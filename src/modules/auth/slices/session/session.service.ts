import 'server-only';

import { headers } from 'next/headers';

import { requireNotImpersonating, requireUser } from '@/shared/access';
import { auditActorFromSession, auditRequestContext, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { describeUserAgent } from '../../models';
import type { MySessionDto } from './session.dto';
import { sessionRepository } from './session.repository';

const log = createLogger('auth.session');

async function recordSessionsRevoked(session: AuthSession, scope: 'one' | 'others') {
  await recordAuditEvent({
    kind: 'auth.sessions_revoked',
    actor: auditActorFromSession(session),
    data: { scope },
    request: auditRequestContext(await headers()),
  });
}

/** Действующие сессии текущего пользователя: текущая — первой, остальные — по активности. */
export async function listMySessions(): Promise<MySessionDto[]> {
  const session = await requireUser();
  const rows = await sessionRepository.listActive(session.user.id, new Date());
  const items = rows.map((row): MySessionDto => ({
    id: row.id,
    current: row.id === session.session.id,
    deviceLabel: describeUserAgent(row.userAgent).label,
    ipAddress: row.ipAddress,
    impersonated: row.impersonatedBy !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  items.sort((a, b) => Number(b.current) - Number(a.current));
  log.debug({ userId: session.user.id, count: items.length }, '[session.list]');
  return items;
}

/**
 * Завершает свою сессию на другом устройстве. Текущую так не завершить — для неё «Выйти».
 * Устройство может оставаться в системе до 5 минут: сессия кешируется в cookie.
 */
export async function revokeMySession(sessionId: string): Promise<void> {
  const session = await requireUser();
  requireNotImpersonating(session, 'session.revoke');
  const userId = session.user.id;
  if (sessionId === session.session.id) {
    throw new ValidationError('Текущую сессию завершает кнопка «Выйти»');
  }
  const deleted = await sessionRepository.deleteOwned(userId, sessionId);
  if (deleted === 0) {
    log.warn({ userId, sessionId }, '[session.revoke] not found or not owned');
    throw new NotFoundError('Сессия не найдена');
  }
  log.info({ userId, sessionId }, '[session.revoke]');
  await recordSessionsRevoked(session, 'one');
}

/** Завершает все сессии, кроме текущей. */
export async function revokeMyOtherSessions(): Promise<number> {
  const session = await requireUser();
  requireNotImpersonating(session, 'session.revokeOthers');
  const count = await sessionRepository.deleteOthers(session.user.id, session.session.id);
  log.info({ userId: session.user.id, count }, '[session.revokeOthers]');
  if (count > 0) await recordSessionsRevoked(session, 'others');
  return count;
}
