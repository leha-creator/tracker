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
          select: { id: true, slug: true, name: true, _count: { select: { members: true } } },
        },
      },
    });
  },

  findById(workspaceId: string) {
    return prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, slug: true, name: true },
    });
  },
};
