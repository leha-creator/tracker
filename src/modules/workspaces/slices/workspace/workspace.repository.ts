import 'server-only';

import { prisma } from '@/shared/db';

export const workspaceRepository = {
  /**
   * Пространства пользователя с его ролью и числом участников: активные или (`archived`)
   * архивные, где он владелец, — остальным архивное пространство недоступно.
   */
  listForUser(userId: string, archived = false) {
    return prisma.workspaceMember.findMany({
      where: archived
        ? { userId, role: 'owner', workspace: { archivedAt: { not: null } } }
        : { userId, workspace: { archivedAt: null } },
      orderBy: { workspace: { name: 'asc' } },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
            archivedAt: true,
            // Агенты — служебные участники, в счётчик не входят.
            _count: { select: { members: { where: { user: { isAgent: false } } } } },
          },
        },
      },
    });
  },

  findById(workspaceId: string) {
    return prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, slug: true, name: true, taskKey: true, archivedAt: true },
    });
  },

  /** Архивирует или восстанавливает пространство; 0 — уже в нужном состоянии. */
  async setArchived(workspaceId: string, archivedAt: Date | null): Promise<number> {
    const { count } = await prisma.workspace.updateMany({
      where: { id: workspaceId, archivedAt: archivedAt ? null : { not: null } },
      data: { archivedAt },
    });
    return count;
  },

  /** Ключ занят другим пространством (кроме `exceptWorkspaceId`). */
  async isTaskKeyTaken(taskKey: string, exceptWorkspaceId?: string): Promise<boolean> {
    const row = await prisma.workspace.findUnique({ where: { taskKey }, select: { id: true } });
    return row !== null && row.id !== exceptWorkspaceId;
  },

  /** Бросает P2002, если ключ занят (см. isUniqueViolation). */
  async setTaskKey(workspaceId: string, taskKey: string): Promise<void> {
    await prisma.workspace.update({ where: { id: workspaceId }, data: { taskKey } });
  },

  async setIcon(workspaceId: string, icon: string): Promise<void> {
    await prisma.workspace.update({ where: { id: workspaceId }, data: { icon } });
  },

  /** Активные пространства с этими ключами: архивные интеграции не обрабатывают. */
  findByTaskKeys(taskKeys: readonly string[]) {
    return prisma.workspace.findMany({
      where: { taskKey: { in: [...taskKeys] }, archivedAt: null },
      select: { id: true, slug: true, name: true, taskKey: true },
    });
  },
};
