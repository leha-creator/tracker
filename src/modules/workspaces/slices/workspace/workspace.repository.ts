import 'server-only';

import { prisma } from '@/shared/db';

export const workspaceRepository = {
  /** Пространства пользователя с его ролью и числом участников. */
  listForUser(userId: string) {
    return prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { workspace: { name: 'asc' } },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
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
      select: { id: true, slug: true, name: true, taskKey: true },
    });
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

  findByTaskKeys(taskKeys: readonly string[]) {
    return prisma.workspace.findMany({
      where: { taskKey: { in: [...taskKeys] } },
      select: { id: true, slug: true, name: true, taskKey: true },
    });
  },
};
