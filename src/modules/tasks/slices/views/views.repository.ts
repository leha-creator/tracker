import 'server-only';

import { prisma } from '@/shared/db';

// Read-модели представлений. Все запросы — с workspaceId в where (защита от IDOR).
export const viewsRepository = {
  /** Размещения проекта с полями карточки — один запрос на всю доску. */
  listBoardPlacements(workspaceId: string, projectId: string) {
    return prisma.taskPlacement.findMany({
      where: { workspaceId, projectId },
      select: {
        taskId: true,
        statusId: true,
        position: true,
        status: { select: { category: true } },
        task: {
          select: {
            number: true,
            title: true,
            priority: true,
            dueDate: true,
            assignee: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });
  },
};

export type BoardPlacementRow = Awaited<
  ReturnType<typeof viewsRepository.listBoardPlacements>
>[number];
