import 'server-only';

import { prisma } from '@/shared/db';

const STATUS_SELECT = { select: { id: true, projectId: true, category: true } } as const;

export const automationRepository = {
  findForProject(workspaceId: string, projectId: string) {
    return prisma.githubProjectAutomation.findFirst({
      where: { workspaceId, projectId },
      select: { prOpenedStatusId: true, prMergedStatusId: true },
    });
  },

  async upsert(
    workspaceId: string,
    projectId: string,
    data: { prOpenedStatusId: string | null; prMergedStatusId: string | null },
  ): Promise<void> {
    await prisma.githubProjectAutomation.upsert({
      where: { projectId },
      create: { projectId, workspaceId, ...data },
      update: data,
    });
  },

  /** Настройки проектов пространства вместе с целевыми статусами (категория, проект). */
  listForProjects(workspaceId: string, projectIds: string[]) {
    return prisma.githubProjectAutomation.findMany({
      where: { workspaceId, projectId: { in: projectIds } },
      select: { projectId: true, prOpenedStatus: STATUS_SELECT, prMergedStatus: STATUS_SELECT },
    });
  },
};
