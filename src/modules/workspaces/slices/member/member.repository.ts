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
        canManageProjects: true,
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

  /**
   * Флаг права участника. Исключение из правила «мутации — через плагин»: у плагина нет API
   * для дополнительных полей участника (поле объявлено с input: false). where с workspaceId —
   * защита от IDOR. Возвращает число изменённых строк.
   */
  async setCanManageProjects(workspaceId: string, memberId: string, value: boolean) {
    const { count } = await prisma.workspaceMember.updateMany({
      where: { id: memberId, workspaceId },
      data: { canManageProjects: value },
    });
    return count;
  },
};
