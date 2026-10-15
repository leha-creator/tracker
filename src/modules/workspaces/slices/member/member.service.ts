import 'server-only';

import {
  parseWorkspaceRole,
  requireWorkspaceAccess,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { Membership } from '../../models';
import { callOrganizationApi } from '../../organization-api';
import type { MemberDto } from './member.dto';
import { memberRepository } from './member.repository';

const log = createLogger('workspaces.member');

async function loadMembership(workspaceId: string, memberId: string): Promise<Membership> {
  const row = await memberRepository.findInWorkspace(workspaceId, memberId);
  const role = row ? parseWorkspaceRole(row.role) : null;
  if (!row || !role) throw new NotFoundError('Участник не найден');
  return new Membership(row.id, row.userId, role);
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
        joinedAt: row.createdAt,
        isCurrentUser: row.user.id === session.user.id,
      },
    ];
  });
}

export async function changeMemberRole(
  session: AuthSession,
  input: { workspaceId: string; memberId: string; role: WorkspaceRole },
): Promise<void> {
  const { workspaceId, memberId, role } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug({ userId: session.user.id, workspaceId, memberId, role }, '[member.changeRole] start');

  const target = await loadMembership(workspaceId, memberId);
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
}

export async function removeMember(
  session: AuthSession,
  input: { workspaceId: string; memberId: string },
): Promise<void> {
  const { workspaceId, memberId } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug({ userId: session.user.id, workspaceId, memberId }, '[member.remove] start');

  const target = await loadMembership(workspaceId, memberId);
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

  const target = await loadMembership(workspaceId, memberId);
  try {
    target.assertPermissionsConfigurable();
  } catch (error) {
    log.warn({ workspaceId, memberId, permission }, '[member.setPermission] rejected: owner');
    throw error;
  }

  const count = await memberRepository.setCanManageProjects(workspaceId, memberId, value);
  if (count === 0) throw new NotFoundError('Участник не найден');
  log.info(
    { workspaceId, memberId, permission, value, byUserId: session.user.id },
    '[member] permission changed',
  );
}
