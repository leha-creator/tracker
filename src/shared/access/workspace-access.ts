import 'server-only';

import { notFound } from 'next/navigation';
import { cache } from 'react';

import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { requireUserOrRedirect } from './guards';
import {
  hasWorkspaceRole,
  parseWorkspaceRole,
  resolveWorkspacePermissions,
  type WorkspacePermission,
  type WorkspacePermissions,
  type WorkspaceRole,
} from './workspace-role';

const log = createLogger('access');

/** Подтверждённый доступ пользователя к пространству. */
export interface WorkspaceAccess {
  userId: string;
  workspaceId: string;
  memberId: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissions;
}

export interface WorkspaceContext {
  session: AuthSession;
  workspace: { id: string; slug: string; name: string };
  access: WorkspaceAccess;
}

// Одно членство читается один раз за запрос, даже если его проверяют несколько сервисов.
const findMembership = cache((workspaceId: string, userId: string) =>
  prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true, role: true, canManageProjects: true },
  }),
);

const findWorkspaceBySlug = cache((slug: string, userId: string) =>
  prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      members: { where: { userId }, select: { id: true, role: true, canManageProjects: true } },
    },
  }),
);

/**
 * Проверяет, что пользователь — участник пространства с ролью не ниже `minRole`.
 * Для сервисов: неучастнику — NOT_FOUND (не раскрываем существование), низкой роли — FORBIDDEN.
 */
export async function requireWorkspaceAccess(
  session: AuthSession,
  workspaceId: string,
  minRole: WorkspaceRole = 'member',
): Promise<WorkspaceAccess> {
  const userId = session.user.id;
  if (session.user.banned) {
    log.warn({ userId, workspaceId }, '[access.requireWorkspaceAccess] banned user');
    throw new ForbiddenError('Учётная запись заблокирована');
  }

  const membership = await findMembership(workspaceId, userId);
  if (!membership) {
    log.warn({ userId, workspaceId }, '[access.requireWorkspaceAccess] not a member');
    throw new NotFoundError('Пространство не найдено');
  }

  const role = parseWorkspaceRole(membership.role);
  if (!role || !hasWorkspaceRole(role, minRole)) {
    log.warn(
      { userId, workspaceId, role: membership.role, minRole },
      '[access.requireWorkspaceAccess] insufficient role',
    );
    throw new ForbiddenError();
  }

  log.debug({ userId, workspaceId, role }, '[access.requireWorkspaceAccess]');
  return {
    userId,
    workspaceId,
    memberId: membership.id,
    role,
    permissions: resolveWorkspacePermissions(role, membership),
  };
}

const PERMISSION_DENIED_MESSAGES: Record<WorkspacePermission, string> = {
  manageProjects: 'Недостаточно прав для управления проектами',
};

/**
 * Проверяет членство и право `permission` (владелец имеет все права).
 * Неучастнику — NOT_FOUND, без права — FORBIDDEN.
 */
export async function requireWorkspacePermission(
  session: AuthSession,
  workspaceId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  if (!access.permissions[permission]) {
    log.warn(
      { userId: access.userId, workspaceId, role: access.role, permission },
      '[access.requireWorkspacePermission] permission denied',
    );
    throw new ForbiddenError(PERMISSION_DENIED_MESSAGES[permission]);
  }
  log.debug(
    { userId: access.userId, workspaceId, permission },
    '[access.requireWorkspacePermission]',
  );
  return access;
}

/**
 * Для страниц `/w/[workspaceSlug]`: без сессии — редирект на вход, неучастнику или при
 * недостаточной роли — 404.
 */
export async function requireWorkspaceAccessBySlug(
  slug: string,
  minRole: WorkspaceRole = 'member',
): Promise<WorkspaceContext> {
  const session = await requireUserOrRedirect(`/w/${slug}`);
  const userId = session.user.id;

  const workspace = await findWorkspaceBySlug(slug, userId);
  const membership = workspace?.members[0];
  if (!workspace || !membership) {
    log.warn({ userId, slug }, '[access.requireWorkspaceAccessBySlug] not found or not a member');
    notFound();
  }

  const role = parseWorkspaceRole(membership.role);
  if (!role || !hasWorkspaceRole(role, minRole)) {
    log.warn(
      { userId, workspaceId: workspace.id, role: membership.role, minRole },
      '[access.requireWorkspaceAccessBySlug] insufficient role',
    );
    notFound();
  }

  log.debug({ userId, workspaceId: workspace.id, role }, '[access.requireWorkspaceAccessBySlug]');
  return {
    session,
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    access: {
      userId,
      workspaceId: workspace.id,
      memberId: membership.id,
      role,
      permissions: resolveWorkspacePermissions(role, membership),
    },
  };
}
