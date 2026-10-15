import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import { TASK_LIST_SELECT } from '../task/task.select';

const LIST_PLACEMENT_SELECT = {
  status: { select: { category: true } },
  task: { select: TASK_LIST_SELECT },
} as const satisfies Prisma.TaskPlacementSelect;

interface PageArgs<Where, OrderBy> {
  /** Обязательно содержит workspaceId (см. task-list.prisma.ts). */
  where: Where;
  orderBy: OrderBy;
  skip: number;
  take: number;
}

// Read-модели представлений. Все запросы — с workspaceId в where (защита от IDOR).
export const viewsRepository = {
  /** Страница задач пространства и общее число по фильтру — согласованно, одной транзакцией. */
  async listTaskPage({
    where,
    orderBy,
    skip,
    take,
  }: PageArgs<Prisma.TaskWhereInput, Prisma.TaskOrderByWithRelationInput[]>) {
    const [total, rows] = await prisma.$transaction([
      prisma.task.count({ where }),
      prisma.task.findMany({ where, orderBy, skip, take, select: TASK_LIST_SELECT }),
    ]);
    return { total, rows };
  },

  /** Страница размещений проекта (строки вкладки «Список») и общее число по фильтру. */
  async listPlacementPage({
    where,
    orderBy,
    skip,
    take,
  }: PageArgs<Prisma.TaskPlacementWhereInput, Prisma.TaskPlacementOrderByWithRelationInput[]>) {
    const [total, rows] = await prisma.$transaction([
      prisma.taskPlacement.count({ where }),
      prisma.taskPlacement.findMany({ where, orderBy, skip, take, select: LIST_PLACEMENT_SELECT }),
    ]);
    return { total, rows };
  },

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
export type ListPlacementRow = Awaited<
  ReturnType<typeof viewsRepository.listPlacementPage>
>['rows'][number];
