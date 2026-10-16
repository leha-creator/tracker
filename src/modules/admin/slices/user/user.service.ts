import 'server-only';

import { prepareAvatarCleanup } from '@/modules/profiles';
import { countWorkspacesByUsers, listSoleOwnedWorkspaces } from '@/modules/workspaces';
import { parseGlobalRole, requireAdmin } from '@/shared/access';
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
import type { AdminUserDto, AdminUserListDto } from './user.dto';
import { userRepository, type AdminUserRow } from './user.repository';
import type { BanUserInput, DeleteUserInput, SetUserRoleInput } from './user.schema';

const log = createLogger('admin.user');

interface TargetUser extends ManagedUser {
  email: string;
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
    emailVerified: row.emailVerified,
    twoFactorEnabled: row.twoFactorEnabled,
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
  const target: TargetUser = { id: row.id, email: row.email, role: parseGlobalRole(row.role) };
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
}

export async function unbanUser(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.unban');

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

  await callAdminApi((api, headers) =>
    api.setRole({ headers, body: { userId: target.id, role: input.role } }),
  );
  log.info({ actorId, userId: target.id, role: input.role }, '[admin.user.setRole] changed');
}

export async function revokeUserSessions(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.revokeSessions');

  await callAdminApi((api, headers) =>
    api.revokeUserSessions({ headers, body: { userId: target.id } }),
  );
  log.info({ actorId, userId: target.id }, '[admin.user.revokeSessions] revoked');
}

/**
 * Сброс 2FA пользователю, который потерял устройство и резервные коды. Все его сессии
 * завершаются: дальше он входит по паролю и при желании включает 2FA заново.
 */
export async function resetUserTwoFactor(input: { userId: string }): Promise<void> {
  const session = await requireAdmin();
  const actorId = session.user.id;
  const target = await loadTarget(actorId, input.userId, 'admin.user.resetTwoFactor');
  const row = await userRepository.findById(target.id);
  if (!row?.twoFactorEnabled) {
    log.warn({ actorId, userId: target.id }, '[admin.user.resetTwoFactor] not enabled');
    throw new ValidationError('У пользователя не включена двухфакторная аутентификация');
  }

  await userRepository.resetTwoFactor(target.id);
  await callAdminApi((api, headers) =>
    api.revokeUserSessions({ headers, body: { userId: target.id } }),
  );
  log.info({ actorId, userId: target.id }, '[admin.user.resetTwoFactor] reset');
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

  // Ключ фото — до удаления (строка профиля уйдёт каскадом), объект — после.
  const cleanupAvatar = await prepareAvatarCleanup(target.id);
  await callAdminApi((api, headers) => api.removeUser({ headers, body: { userId: target.id } }));
  await cleanupAvatar();
  log.info(
    { actorId, userId: target.id, email: maskEmail(target.email) },
    '[admin.user.delete] deleted',
  );
}
