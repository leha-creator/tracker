import 'server-only';

import { listUserApiTokensForAdmin, revokeApiTokenBySystem } from '@/modules/api-tokens';
import { listUserSessionsBySystem, revokeUserSessionBySystem } from '@/modules/auth';
import { describeUserAgent } from '@/modules/auth/client';
import { getGithubIdentity } from '@/modules/integrations/github';
import { getProfileCards } from '@/modules/profiles';
import {
  countWorkspacesByUsers,
  listSoleOwnedWorkspaces,
  listUserMemberships,
} from '@/modules/workspaces';
import { parseGlobalRole, requireAdmin } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent, type AuditEventKind } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger, maskEmail } from '@/shared/logger';

import { callAdminApi } from '../../admin-api';
import {
  ADMIN_USERS_PAGE_SIZE,
  assertCanBan,
  assertCanDelete,
  assertCanManageUser,
  assertRoleChange,
  banDurationToSeconds,
  isDeleteConfirmed,
  resolveBanState,
  type AdminUserListQuery,
  type ManagedUser,
} from '../../models';
import type {
  AdminUserDetailDto,
  AdminUserDto,
  AdminUserListDto,
  AdminUserSessionDto,
} from './user.dto';
import { userRepository, type AdminUserRow } from './user.repository';
import type {
  BanUserInput,
  DeleteUserInput,
  RevokeUserSessionInput,
  RevokeUserTokenInput,
  SetUserRoleInput,
} from './user.schema';

const log = createLogger('admin.user');

interface TargetUser extends ManagedUser {
  email: string;
  name: string;
}

type SimpleAdminUserEvent = Extract<
  AuditEventKind,
  'admin.user_unbanned' | 'admin.user_sessions_revoked' | 'admin.user_session_revoked'
>;

/** Действие администратора над пользователем — в журнал (видят только администраторы). */
function recordAdminUserEvent(
  kind: SimpleAdminUserEvent,
  session: AuthSession,
  target: TargetUser,
): Promise<void> {
  return recordAuditEvent({
    kind,
    actor: auditActorFromSession(session),
    targetUserId: target.id,
    data: { userName: target.name },
  });
}

function toAdminUserDto(
  row: AdminUserRow,
  context: { now: Date; actorId: string; workspaces: Map<string, number> },
): AdminUserDto {
  const ban = resolveBanState(row, context.now);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    role: parseGlobalRole(row.role),
    ban: ban.kind === 'active' ? ban : { ...ban, reason: row.banReason || null },
    workspacesCount: context.workspaces.get(row.id) ?? 0,
    createdAt: row.createdAt,
    isCurrentUser: row.id === context.actorId,
  };
}

/** Целевой пользователь + правило «не над собой». */
async function loadTarget(actorId: string, userId: string, scope: string): Promise<TargetUser> {
  const row = await userRepository.findById(userId);
  if (!row) {
    log.warn({ actorId, userId }, `[${scope}] user not found`);
    throw new NotFoundError('Пользователь не найден');
  }
  // Агентом управляет владелец пространства (модуль agents), в админке его как будто нет.
  if (row.isAgent) {
    log.warn({ actorId, userId, scope }, '[admin.user] agent hidden');
    throw new NotFoundError('Пользователь не найден');
  }
  const target: TargetUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: parseGlobalRole(row.role),
  };
  try {
    assertCanManageUser(actorId, target);
  } catch (error) {
    log.warn({ actorId, userId }, `[${scope}] self action rejected`);
    throw error;
  }
  return target;
}

/** Применяет правило модели; отказ логируется с причиной. */
function checkRule(scope: string, context: Record<string, unknown>, rule: () => void): void {
  try {
    rule();
  } catch (error) {
    log.warn(
      { ...context, reason: error instanceof Error ? error.message : String(error) },
      `[${scope}] rejected`,
    );
    throw error;
  }
}

export async function listAdminUsers(query: AdminUserListQuery): Promise<AdminUserListDto> {
  const session = await requireAdmin();
  const now = new Date();
  const { rows, total } = await userRepository.list(query, now);
  const workspaces = await countWorkspacesByUsers(rows.map((row) => row.id));

  log.debug(
    {
      actorId: session.user.id,
      page: query.page,
      hasQuery: query.q.length > 0,
      role: query.role,
      status: query.status,
      sort: query.sort,
      total,
    },
    '[admin.user.list]',
  );

  return {
    items: rows.map((row) => toAdminUserDto(row, { now, actorId: session.user.id, workspaces })),
    total,
    page: query.page,
    pageCount: Math.ceil(total / ADMIN_USERS_PAGE_SIZE),
  };
}

export async function banUser(input: BanUserInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.ban');
  checkRule('admin.user.ban', { actorId, userId: target.id }, () => assertCanBan(target));

  await callAdminApi((api, headers) =>
    api.banUser({
      headers,
      body: {
        userId: target.id,
        banReason: input.reason || undefined,
        banExpiresIn: banDurationToSeconds(input.duration),
      },
    }),
  );
  // Причину не логируем: свободный текст администратора.
  log.info({ actorId, userId: target.id, duration: input.duration }, '[admin.user.ban] banned');
  // В журнале причина есть: его видят только администраторы.
  await recordAuditEvent({
    kind: 'admin.user_banned',
    actor: auditActorFromSession(session),
    targetUserId: target.id,
    data: { userName: target.name, duration: input.duration, reason: input.reason || null },
  });
}

export async function unbanUser(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.unban');

  await callAdminApi((api, headers) => api.unbanUser({ headers, body: { userId: target.id } }));
  log.info({ actorId, userId: target.id }, '[admin.user.unban] unbanned');
  await recordAdminUserEvent('admin.user_unbanned', session, target);
}

export async function setUserRole(input: SetUserRoleInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.setRole');
  checkRule('admin.user.setRole', { actorId, userId: target.id, role: input.role }, () =>
    assertRoleChange(target, input.role),
  );

  await callAdminApi((api, headers) =>
    api.setRole({ headers, body: { userId: target.id, role: input.role } }),
  );
  log.info({ actorId, userId: target.id, role: input.role }, '[admin.user.setRole] changed');
  await recordAuditEvent({
    kind: 'admin.user_role_changed',
    actor: auditActorFromSession(session),
    targetUserId: target.id,
    data: { userName: target.name, role: input.role },
  });
}

export async function revokeUserSessions(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.revokeSessions');

  await callAdminApi((api, headers) =>
    api.revokeUserSessions({ headers, body: { userId: target.id } }),
  );
  log.info({ actorId, userId: target.id }, '[admin.user.revokeSessions] revoked');
  await recordAdminUserEvent('admin.user_sessions_revoked', session, target);
}

export async function deleteUser(input: DeleteUserInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.delete');

  if (!isDeleteConfirmed(target.email, input.confirmEmail)) {
    log.warn({ actorId, userId: target.id }, '[admin.user.delete] confirmation mismatch');
    throw new ValidationError('Email не совпадает', {
      fieldErrors: { confirmEmail: ['Введите email удаляемого пользователя'] },
    });
  }

  // Проверка и удаление не атомарны: пользователь может стать единственным владельцем между
  // ними. Окно мало и требует действий самого пользователя; плагин не даёт транзакции.
  const soleOwned = await listSoleOwnedWorkspaces(target.id);
  checkRule(
    'admin.user.delete',
    { actorId, userId: target.id, soleOwnedCount: soleOwned.length },
    () => assertCanDelete(target, soleOwned),
  );

  await callAdminApi((api, headers) => api.removeUser({ headers, body: { userId: target.id } }));
  log.info(
    { actorId, userId: target.id, email: maskEmail(target.email) },
    '[admin.user.delete] deleted',
  );
  // Пользователя уже нет: без targetUserId (иначе нарушится FK), имя и email маской — в снимке.
  await recordAuditEvent({
    kind: 'admin.user_deleted',
    actor: auditActorFromSession(session),
    data: { userName: target.name, email: maskEmail(target.email) },
  });
}

/**
 * Карточка пользователя: сведения, пространства, сессии, токены. Агента в админке нет —
 * NOT_FOUND, как в списке. Себя смотреть можно (действия над собой запрещают сами действия).
 */
export async function getAdminUserDetail(userId: string): Promise<AdminUserDetailDto> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const row = await userRepository.findDetail(userId);
  if (!row || row.isAgent) {
    log.warn({ actorId, userId }, '[admin.user.detail] not found');
    throw new NotFoundError('Пользователь не найден');
  }
  const now = new Date();
  const [cards, github, memberships, sessionRows, tokens, workspaces] = await Promise.all([
    getProfileCards([row.id]),
    getGithubIdentity(row.id),
    listUserMemberships(row.id),
    listUserSessionsBySystem(row.id, now),
    listUserApiTokensForAdmin(row.id),
    countWorkspacesByUsers([row.id]),
  ]);
  const card = cards.get(row.id);
  log.debug(
    { actorId, userId, sessions: sessionRows.length, tokens: tokens.length },
    '[admin.user.detail]',
  );
  return {
    user: {
      ...toAdminUserDto(row, { now, actorId, workspaces }),
      position: card?.position ?? null,
      bio: card?.bio ?? null,
      updatedAt: row.updatedAt,
      github,
    },
    memberships,
    sessions: sessionRows.map((item): AdminUserSessionDto => ({
      id: item.id,
      deviceLabel: describeUserAgent(item.userAgent).label,
      ipAddress: item.ipAddress,
      impersonated: item.impersonated,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      expiresAt: item.expiresAt,
    })),
    tokens,
  };
}

/**
 * Завершает одну сессию пользователя. Устройство может оставаться в системе до 5 минут:
 * сессия кешируется в cookie.
 */
export async function revokeUserSession(input: RevokeUserSessionInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.revokeSession');
  const revoked = await revokeUserSessionBySystem(target.id, input.sessionId);
  if (!revoked) {
    log.warn(
      { actorId, userId: target.id, sessionId: input.sessionId },
      '[admin.user.revokeSession] not found',
    );
    throw new NotFoundError('Сессия не найдена');
  }
  log.info(
    { actorId, userId: target.id, sessionId: input.sessionId },
    '[admin.user.revokeSession] revoked',
  );
  await recordAdminUserEvent('admin.user_session_revoked', session, target);
}

/** Отзывает токен доступа пользователя. Токен другого пользователя — NOT_FOUND. */
export async function revokeUserApiToken(input: RevokeUserTokenInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.revokeToken');
  const { name, revoked } = await revokeApiTokenBySystem(target.id, input.tokenId);
  log.info(
    { actorId, userId: target.id, tokenId: input.tokenId, revoked },
    '[admin.user.revokeToken] processed',
  );
  if (!revoked) return;
  await recordAuditEvent({
    kind: 'admin.user_token_revoked',
    actor: auditActorFromSession(session),
    targetUserId: target.id,
    data: { userName: target.name, tokenName: name },
  });
}
