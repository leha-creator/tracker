import 'server-only';

import { PERMISSION_FLAGS, type WorkspacePermission } from '@/shared/access/workspace-role';
import { prisma } from '@/shared/db';

export const memberRepository = {
  listByWorkspace(workspaceId: string) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        canManageProjects: true,
        canManageDocuments: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, image: true, isAgent: true } },
      },
    });
  },

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const row = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    return row !== null;
  },

  /** Участник по userId — только внутри указанного пространства. */
  findByUser(workspaceId: string, userId: string) {
    return prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        id: true,
        role: true,
        canManageProjects: true,
        canManageDocuments: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
            isAgent: true,
            // Ответственный агента (таблица модуля agents — чтение для профиля и карточки).
            agent: { select: { responsible: { select: { id: true, name: true } } } },
          },
        },
      },
    });
  },

  /** Имена и email участников — для упоминаний в комментариях. */
  listIdentities(workspaceId: string) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        user: { select: { id: true, name: true, email: true, image: true, isAgent: true } },
      },
    });
  },

  /** Есть ли у двух пользователей общее пространство. */
  async sharesWorkspace(userId: string, otherUserId: string): Promise<boolean> {
    const row = await prisma.workspaceMember.findFirst({
      where: { userId, workspace: { members: { some: { userId: otherUserId } } } },
      select: { id: true },
    });
    return row !== null;
  },

  /** Число пространств каждого пользователя: один groupBy на страницу списка. */
  async countByUsers(userIds: string[]): Promise<Map<string, number>> {
    const rows = await prisma.workspaceMember.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.userId, row._count._all]));
  },

  /** Членства пользователя во всех пространствах — для карточки в админке. */
  listByUser(userId: string) {
    return prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { workspace: { name: 'asc' } },
      select: {
        role: true,
        canManageProjects: true,
        canManageDocuments: true,
        createdAt: true,
        workspace: { select: { id: true, slug: true, name: true, archivedAt: true } },
      },
    });
  },

  /** Пространства, где пользователь — владелец и других владельцев нет. */
  listSoleOwnedWorkspaces(userId: string) {
    return prisma.workspace.findMany({
      where: {
        members: {
          some: { userId, role: 'owner' },
          none: { role: 'owner', userId: { not: userId } },
        },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  },

  countOwners(workspaceId: string) {
    return prisma.workspaceMember.count({ where: { workspaceId, role: 'owner' } });
  },

  /** Участник по id — только внутри указанного пространства (защита от IDOR). */
  findInWorkspace(workspaceId: string, memberId: string) {
    return prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { isAgent: true, name: true } },
      },
    });
  },

  /**
   * Флаг права участника. Исключение из правила «мутации — через плагин»: у плагина нет API
   * для дополнительных полей участника (поле объявлено с input: false). where с workspaceId —
   * защита от IDOR. Возвращает число изменённых строк.
   */
  async setPermission(
    workspaceId: string,
    memberId: string,
    permission: WorkspacePermission,
    value: boolean,
  ) {
    const { count } = await prisma.workspaceMember.updateMany({
      where: { id: memberId, workspaceId },
      data: { [PERMISSION_FLAGS[permission]]: value },
    });
    return count;
  },
};
