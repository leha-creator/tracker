import 'server-only';

import { prisma } from '@/shared/db';

export const memberRepository = {
  listByWorkspace(workspaceId: string) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  },

  countOwners(workspaceId: string) {
    return prisma.workspaceMember.count({ where: { workspaceId, role: 'owner' } });
  },

  /** Участник по id — только внутри указанного пространства (защита от IDOR). */
  findInWorkspace(workspaceId: string, memberId: string) {
    return prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, userId: true, role: true },
    });
  },
};
