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
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger, maskEmail } from '@/shared/logger';

import {
  callAdminApi,
  callIdpAdmin,
  loadIdpAccountState,
  resolveIdpSubjects,
} from '../../admin-api';
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

// Операции над учётной записью идут в Admin API IdP (он же пишет события admin.* в свой журнал),
// а затем — в плагин admin локально: локальный бан и отзыв сессий гасят сессии Tasker, пока нет
// back-channel logout. Сеансы Tasker по одному и токены — только локально, их журнал — у tasker.

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

  const subjects = await resolveIdpSubjects(actorId, target.id);
  const banReason = input.reason || undefined;
  const banExpiresIn = banDurationToSeconds(input.duration);
  // Причина уходит в журнал IdP (его видят только администраторы), в логи — нет.
  await callIdpAdmin(subjects, { kind: 'ban', banReason, banExpiresIn });
  await callAdminApi((api, headers) =>
    api.banUser({ headers, body: { userId: target.id, banReason, banExpiresIn } }),
  );
  log.info({ actorId, userId: target.id, duration: input.duration }, '[admin.user.ban] banned');
}

export async function unbanUser(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.unban');

  const subjects = await resolveIdpSubjects(actorId, target.id);
  await callIdpAdmin(subjects, { kind: 'unban' });
  await callAdminApi((api, headers) => api.unbanUser({ headers, body: { userId: target.id } }));
  log.info({ actorId, userId: target.id }, '[admin.user.unban] unbanned');
}

export async function setUserRole(input: SetUserRoleInput): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.setRole');
  checkRule('admin.user.setRole', { actorId, userId: target.id, role: input.role }, () =>
    assertRoleChange(target, input.role),
  );

  // Роль admin в IdP нужна для Admin API и журнала IdP, поэтому роль меняется в обоих местах.
  const subjects = await resolveIdpSubjects(actorId, target.id);
  await callIdpAdmin(subjects, { kind: 'role', role: input.role });
  await callAdminApi((api, headers) =>
    api.setRole({ headers, body: { userId: target.id, role: input.role } }),
  );
  log.info({ actorId, userId: target.id, role: input.role }, '[admin.user.setRole] changed');
}

export async function revokeUserSessions(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.revokeSessions');

  // Сначала IdP: иначе пользователь войдёт в Tasker снова через живую сессию plwedding ID.
  const subjects = await resolveIdpSubjects(actorId, target.id);
  await callIdpAdmin(subjects, { kind: 'revokeSessions' });
  await revokeLocalSessions(target.id);
  log.info({ actorId, userId: target.id }, '[admin.user.revokeSessions] revoked');
}

function revokeLocalSessions(userId: string): Promise<unknown> {
  return callAdminApi((api, headers) => api.revokeUserSessions({ headers, body: { userId } }));
}

/**
 * Сбрасывает 2FA в IdP (для потерявшего телефон и резервные коды): IdP удаляет секрет и коды и
 * завершает свои сессии; сеансы Tasker завершаются здесь.
 */
export async function resetUserTwoFactor(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.resetTwoFactor');
  const subjects = await resolveIdpSubjects(actorId, target.id);
  await callIdpAdmin(subjects, { kind: 'resetTwoFactor' });
  await revokeLocalSessions(target.id);
  log.info({ actorId, userId: target.id }, '[admin.user.resetTwoFactor] reset');
}

/** Подтверждает email в IdP вручную (письмо не доходит, адрес проверен иначе). */
export async function verifyUserEmail(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.verifyEmail');
  await callIdpAdmin(await resolveIdpSubjects(actorId, target.id), { kind: 'verifyEmail' });
  log.info(
    { actorId, userId: target.id, email: maskEmail(target.email) },
    '[admin.user.verifyEmail] verified',
  );
}

/** Письмо сброса пароля от IdP: текущий пароль действует, пока не задан новый. */
export async function sendPasswordResetEmail(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.sendPasswordReset');
  await callIdpAdmin(await resolveIdpSubjects(actorId, target.id), { kind: 'sendPasswordReset' });
  log.info(
    { actorId, userId: target.id, email: maskEmail(target.email) },
    '[admin.user.sendPasswordReset] sent',
  );
}

/** Письмо подтверждения email от IdP. */
export async function resendVerificationEmail(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.resendVerification');
  await callIdpAdmin(await resolveIdpSubjects(actorId, target.id), { kind: 'sendVerification' });
  log.info(
    { actorId, userId: target.id, email: maskEmail(target.email) },
    '[admin.user.resendVerification] sent',
  );
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
  const [cards, github, memberships, sessionRows, tokens, workspaces, identity] = await Promise.all(
    [
      getProfileCards([row.id]),
      getGithubIdentity(row.id),
      listUserMemberships(row.id),
      listUserSessionsBySystem(row.id, now),
      listUserApiTokensForAdmin(row.id),
      countWorkspacesByUsers([row.id]),
      loadIdpAccountState(actorId, row.id),
    ],
  );
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
      identity,
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
  await recordAuditEvent({
    kind: 'admin.user_session_revoked',
    actor: auditActorFromSession(session),
    targetUserId: target.id,
    data: { userName: target.name },
  });
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
