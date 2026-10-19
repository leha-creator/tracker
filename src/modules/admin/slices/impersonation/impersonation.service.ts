import 'server-only';

import { headers } from 'next/headers';

import { parseGlobalRole, requireAdmin, requireUser } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import { getSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

import { callAdminApi } from '../../admin-api';
import { assertCanImpersonate, resolveBanState } from '../../models';
import { userRepository } from '../user/user.repository';

const log = createLogger('admin.impersonation');

/** Текущий вход от имени пользователя — для баннера в шапке. */
export interface ImpersonationStateDto {
  userName: string;
  adminName: string;
  expiresAt: Date;
}

/**
 * Вход администратора от имени пользователя на час: для поддержки и доступа к чужому
 * пространству. Сессия администратора сохраняется в отдельной cookie плагина и возвращается
 * при выходе из режима.
 */
export async function startImpersonation(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const row = await userRepository.findById(input.userId);
  if (!row) {
    log.warn({ actorId, userId: input.userId }, '[admin.impersonation.start] user not found');
    throw new NotFoundError('Пользователь не найден');
  }
  try {
    assertCanImpersonate(actorId, {
      id: row.id,
      role: parseGlobalRole(row.role),
      isAgent: row.isAgent,
      bannedNow: resolveBanState(row, new Date()).kind === 'banned',
    });
  } catch (error) {
    log.warn(
      {
        actorId,
        userId: row.id,
        reason: error instanceof Error ? error.message : String(error),
      },
      '[admin.impersonation.start] rejected',
    );
    throw error;
  }
  const requestHeaders = await headers();
  await enforceRateLimit('admin-impersonate', {
    ip: getClientIp(requestHeaders),
    userId: actorId,
  });

  await callAdminApi((api, requestHeaders) =>
    api.impersonateUser({ headers: requestHeaders, body: { userId: row.id } }),
  );
  log.info({ actorId, userId: row.id }, '[admin.impersonation.start]');
  await recordAuditEvent({
    kind: 'admin.impersonation_started',
    actor: auditActorFromSession(session),
    targetUserId: row.id,
    data: { userName: row.name },
  });
}

/**
 * Выход из режима «от имени»: сессия пользователя удаляется, cookie администратора
 * восстанавливается. Возвращает id пользователя — для перехода на его карточку.
 */
export async function stopImpersonation(): Promise<{ userId: string }> {
  const session = await requireUser();
  const adminId = session.session.impersonatedBy;
  if (!adminId) {
    log.warn({ userId: session.user.id }, '[admin.impersonation.stop] not impersonating');
    throw new ValidationError('Вход от имени пользователя не выполнен');
  }

  await callAdminApi((api, requestHeaders) => api.stopImpersonating({ headers: requestHeaders }));
  log.info({ actorId: adminId, userId: session.user.id }, '[admin.impersonation.stop]');
  // Автор — администратор: событие о нём, а не о пользователе.
  await recordAuditEvent({
    kind: 'admin.impersonation_stopped',
    actor: { actorId: adminId },
    targetUserId: session.user.id,
    data: { userName: session.user.name },
  });
  return { userId: session.user.id };
}

/** Состояние имперсонации текущей сессии; null — обычный вход или нет сессии. */
export async function getMyImpersonation(): Promise<ImpersonationStateDto | null> {
  const session = await getSession();
  const adminId = session?.session.impersonatedBy;
  if (!session || !adminId) return null;
  const admin = await userRepository.findById(adminId);
  log.debug({ userId: session.user.id, adminId }, '[admin.impersonation.state]');
  return {
    userName: session.user.name,
    adminName: admin?.name ?? 'администратор',
    expiresAt: session.session.expiresAt,
  };
}
