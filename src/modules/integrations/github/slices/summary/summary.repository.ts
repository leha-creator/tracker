import 'server-only';

import { prisma } from '@/shared/db';

export const summaryRepository = {
  /** Репозитории, выбранные для пространства, с признаком приостановленной установки. */
  listEnabledRepositories(workspaceId: string) {
    return prisma.workspaceGithubRepository.findMany({
      where: { workspaceId },
      orderBy: { repository: { fullName: 'asc' } },
      select: {
        repository: {
          select: { fullName: true, installation: { select: { suspendedAt: true } } },
        },
      },
    });
  },

  /** Настройки автосмены статуса всех проектов пространства. */
  listAutomations(workspaceId: string) {
    return prisma.githubProjectAutomation.findMany({
      where: { workspaceId },
      select: { projectId: true, prOpenedStatusId: true, prMergedStatusId: true },
    });
  },
};
