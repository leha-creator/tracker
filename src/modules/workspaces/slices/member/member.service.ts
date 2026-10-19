import 'server-only';

import {
  parseWorkspaceRole,
  requireWorkspaceAccess,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { Membership } from '../../models';
import { callOrganizationApi } from '../../organization-api';
import type {
  MemberDto,
  MemberIdentityDto,
  SoleOwnedWorkspaceDto,
  UserMembershipDto,
  WorkspaceMemberDto,
} from './member.dto';
import { memberRepository } from './member.repository';

const log = createLogger('workspaces.member');

/**
 * Участник для изменения владельцем. Агентом управляют в разделе «Агенты» (модуль agents):
 * роль, права и исключение здесь для него запрещены.
 */
async function loadMembership(
  workspaceId: string,
  memberId: string,
  scope: string,
): Promise<{ target: Membership; name: string }> {
  const row = await memberRepository.findInWorkspace(workspaceId, memberId);
  const role = row ? parseWorkspaceRole(row.role) : null;
  if (!row || !role) throw new NotFoundError('Участник не найден');
  if (row.user.isAgent) {
    log.warn({ workspaceId, memberId, scope }, '[member] agent change rejected');
    throw new ValidationError('Агентом управляют в настройках пространства, в разделе «Агенты»');
  }
  return { target: new Membership(row.id, row.userId, role), name: row.user.name };
}

export async function listMembers(session: AuthSession, workspaceId: string): Promise<MemberDto[]> {
  await requireWorkspaceAccess(session, workspaceId, 'member');
  log.debug({ userId: session.user.id, workspaceId }, '[member.listMembers]');

  const rows = await memberRepository.listByWorkspace(workspaceId);
  return rows.flatMap((row) => {
    const role = parseWorkspaceRole(row.role);
    if (!role) {
      log.warn(
        { workspaceId, memberId: row.id, role: row.role },
        '[member.listMembers] unknown role',
      );
      return [];
    }
    return [
      {
        id: row.id,
        userId: row.user.id,
        name: row.user.name,
        email: row.user.email,
        image: row.user.image,
        role,
        canManageProjects: row.canManageProjects,
        canManageDocuments: row.canManageDocuments,
        joinedAt: row.createdAt,
        isCurrentUser: row.user.id === session.user.id,
        isAgent: row.user.isAgent,
      },
    ];
  });
}

/**
 * Является ли пользователь участником пространства. Без проверки сессии: только для серверных
 * модулей, которые уже проверили доступ текущего пользователя к пространству (например,
 * ответственный задачи в модуле tasks).
 */
export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const result = await memberRepository.isMember(workspaceId, userId);
  log.debug({ workspaceId, userId, result }, '[member.isWorkspaceMember]');
  return result;
}

/**
 * Участник пространства по userId: роль, дата вступления, право на проекты. Смотрящий должен
 * быть участником; цель не участник — `NotFoundError` (кто есть в чужих пространствах, не
 * раскрываем).
 */
export async function getMember(
  session: AuthSession,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMemberDto> {
  await requireWorkspaceAccess(session, workspaceId, 'member');
  const row = await memberRepository.findByUser(workspaceId, userId);
  const role = row ? parseWorkspaceRole(row.role) : null;
  if (!row || !role) {
    log.warn({ viewerId: session.user.id, workspaceId, userId }, '[member.getMember] not found');
    throw new NotFoundError('Участник не найден');
  }
  log.debug({ viewerId: session.user.id, workspaceId, userId }, '[member.getMember]');
  return {
    memberId: row.id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image,
    role,
    canManageProjects: role === 'owner' || row.canManageProjects,
    canManageDocuments: role === 'owner' || row.canManageDocuments,
    joinedAt: row.createdAt,
    registeredAt: row.user.createdAt,
    isCurrentUser: row.user.id === session.user.id,
    isAgent: row.user.isAgent,
    responsible: row.user.agent?.responsible
      ? { userId: row.user.agent.responsible.id, name: row.user.agent.responsible.name }
      : null,
  };
}

/**
 * Имена и email участников — кандидаты для @упоминаний. Без проверки сессии: только для
 * серверных модулей, которые уже проверили доступ к пространству (комментарии в tasks).
 */
export async function listMemberIdentities(workspaceId: string): Promise<MemberIdentityDto[]> {
  const rows = await memberRepository.listIdentities(workspaceId);
  log.debug({ workspaceId, count: rows.length }, '[member.listMemberIdentities]');
  return rows.map(({ user }) => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    isAgent: user.isAgent,
  }));
}

/**
 * Есть ли у пользователей общее пространство. Без проверки сессии: для серверных модулей
 * (доступ к фото профиля).
 */
export async function sharesWorkspace(userId: string, otherUserId: string): Promise<boolean> {
  if (userId === otherUserId) return true;
  const result = await memberRepository.sharesWorkspace(userId, otherUserId);
  log.debug({ userId, otherUserId, result }, '[member.sharesWorkspace]');
  return result;
}

/**
 * Число пространств каждого из пользователей (нет записи — 0). Без проверки сессии: только для
 * серверных модулей, которые уже проверили права (например, админка ресурса).
 */
export async function countWorkspacesByUsers(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const result = await memberRepository.countByUsers(userIds);
  log.debug({ usersCount: userIds.length }, '[member.countWorkspacesByUsers]');
  return result;
}

/**
 * Пространства пользователя с ролями. Без проверки сессии: только для модуля admin, уже
 * вызвавшего requireAdmin().
 */
export async function listUserMemberships(userId: string): Promise<UserMembershipDto[]> {
  const rows = await memberRepository.listByUser(userId);
  log.debug({ userId, count: rows.length }, '[member.listUserMemberships]');
  return rows.flatMap((row) => {
    const role = parseWorkspaceRole(row.role);
    if (!role) {
      log.warn(
        { userId, workspaceId: row.workspace.id, role: row.role },
        '[member.listUserMemberships] unknown role',
      );
      return [];
    }
    return [
      {
        workspace: {
          id: row.workspace.id,
          slug: row.workspace.slug,
          name: row.workspace.name,
          archived: row.workspace.archivedAt !== null,
        },
        role,
        canManageProjects: row.canManageProjects,
        canManageDocuments: row.canManageDocuments,
        joinedAt: row.createdAt,
      },
    ];
  });
}

/**
 * Пространства, где пользователь — единственный владелец. Без проверки сессии: только для
 * серверных модулей, которые уже проверили права (например, удаление пользователя в админке).
 */
export async function listSoleOwnedWorkspaces(userId: string): Promise<SoleOwnedWorkspaceDto[]> {
  const rows = await memberRepository.listSoleOwnedWorkspaces(userId);
  log.debug({ userId, count: rows.length }, '[member.listSoleOwnedWorkspaces]');
  return rows;
}

export async function changeMemberRole(
  session: AuthSession,
  input: { workspaceId: string; memberId: string; role: WorkspaceRole },
): Promise<void> {
  const { workspaceId, memberId, role } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug({ userId: session.user.id, workspaceId, memberId, role }, '[member.changeRole] start');

  const { target, name } = await loadMembership(workspaceId, memberId, 'changeRole');
  const ownersCount = await memberRepository.countOwners(workspaceId);
  try {
    target.assertCanChangeRole(role, ownersCount);
  } catch (error) {
    log.warn(
      { workspaceId, memberId, from: target.role, to: role, ownersCount },
      '[member.changeRole] rejected',
    );
    throw error;
  }

  await callOrganizationApi((api, headers) =>
    api.updateMemberRole({ body: { organizationId: workspaceId, memberId, role }, headers }),
  );
  log.info(
    { workspaceId, memberId, from: target.role, to: role, byUserId: session.user.id },
    '[member] role changed',
  );
  await recordAuditEvent({
    kind: 'workspace.member_role_changed',
    actor: auditActorFromSession(session),
    targetUserId: target.userId,
    workspaceId,
    data: { memberName: name, role },
  });
}

export async function removeMember(
  session: AuthSession,
  input: { workspaceId: string; memberId: string },
): Promise<void> {
  const { workspaceId, memberId } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug({ userId: session.user.id, workspaceId, memberId }, '[member.remove] start');

  const { target, name } = await loadMembership(workspaceId, memberId, 'remove');
  const ownersCount = await memberRepository.countOwners(workspaceId);
  try {
    target.assertCanBeRemovedBy(session.user.id, ownersCount);
  } catch (error) {
    log.warn({ workspaceId, memberId, role: target.role, ownersCount }, '[member.remove] rejected');
    throw error;
  }

  await callOrganizationApi((api, headers) =>
    api.removeMember({ body: { organizationId: workspaceId, memberIdOrEmail: memberId }, headers }),
  );
  log.info({ workspaceId, memberId, byUserId: session.user.id }, '[member] removed');
  await recordAuditEvent({
    kind: 'workspace.member_removed',
    actor: auditActorFromSession(session),
    targetUserId: target.userId,
    workspaceId,
    data: { memberName: name, left: false },
  });
}

export async function leaveWorkspace(
  session: AuthSession,
  input: { workspaceId: string },
): Promise<void> {
  const { workspaceId } = input;
  const access = await requireWorkspaceAccess(session, workspaceId, 'member');
  log.debug({ userId: session.user.id, workspaceId }, '[member.leave] start');

  const self = new Membership(access.memberId, access.userId, access.role);
  const ownersCount = await memberRepository.countOwners(workspaceId);
  try {
    self.assertCanLeave(ownersCount);
  } catch (error) {
    log.warn({ workspaceId, userId: session.user.id, ownersCount }, '[member.leave] rejected');
    throw error;
  }

  await callOrganizationApi((api, headers) =>
    api.leaveOrganization({ body: { organizationId: workspaceId }, headers }),
  );
  log.info({ workspaceId, userId: session.user.id }, '[member] left');
  await recordAuditEvent({
    kind: 'workspace.member_removed',
    actor: auditActorFromSession(session),
    targetUserId: session.user.id,
    workspaceId,
    data: { memberName: session.user.name, left: true },
  });
}

/** Выдаёт или отзывает право участника (только владелец, только участнику с ролью member). */
export async function setMemberPermission(
  session: AuthSession,
  input: { workspaceId: string; memberId: string; permission: WorkspacePermission; value: boolean },
): Promise<void> {
  const { workspaceId, memberId, permission, value } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug(
    { userId: session.user.id, workspaceId, memberId, permission, value },
    '[member.setPermission] start',
  );

  const { target, name } = await loadMembership(workspaceId, memberId, 'setPermission');
  try {
    target.assertPermissionsConfigurable();
  } catch (error) {
    log.warn({ workspaceId, memberId, permission }, '[member.setPermission] rejected: owner');
    throw error;
  }

  const count = await memberRepository.setPermission(workspaceId, memberId, permission, value);
  if (count === 0) throw new NotFoundError('Участник не найден');
  log.info(
    { workspaceId, memberId, permission, value, byUserId: session.user.id },
    '[member] permission changed',
  );
  await recordAuditEvent({
    kind: 'workspace.member_permissions_changed',
    actor: auditActorFromSession(session),
    targetUserId: target.userId,
    workspaceId,
    data: { memberName: name, permission, value },
  });
}
