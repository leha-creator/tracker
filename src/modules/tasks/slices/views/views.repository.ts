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

/** Открытая задача: без размещений или хотя бы в одном проекте статус не «Готово». */
const OPEN_TASK_WHERE = {
  OR: [
    { placements: { none: {} } },
    { placements: { some: { status: { category: { not: 'done' } } } } },
  ],
} as const satisfies Prisma.TaskWhereInput;

/** Выполненная задача: размещения есть, и во всех статус «Готово». */
const DONE_TASK_WHERE = {
  placements: { some: {}, every: { status: { category: 'done' } } },
} as const satisfies Prisma.TaskWhereInput;

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

  /**
   * Сводка задач участника: открытые и просроченные (он ответственный), выполненные с `since`,
   * созданные им задачи, его комментарии, последняя активность и ближайшие открытые задачи.
   */
  async memberSummary(
    workspaceId: string,
    userId: string,
    options: { today: Date; since: Date; take: number },
  ) {
    const assigned = { workspaceId, assigneeId: userId } satisfies Prisma.TaskWhereInput;
    const open = { ...assigned, ...OPEN_TASK_WHERE } satisfies Prisma.TaskWhereInput;
    const [
      openCount,
      overdueCount,
      doneRecentlyCount,
      createdCount,
      commentsCount,
      lastComment,
      lastTask,
      openTasks,
    ] = await prisma.$transaction([
      prisma.task.count({ where: open }),
      prisma.task.count({ where: { ...open, dueDate: { lt: options.today } } }),
      prisma.task.count({
        where: { ...assigned, ...DONE_TASK_WHERE, updatedAt: { gte: options.since } },
      }),
      prisma.task.count({ where: { workspaceId, createdById: userId } }),
      prisma.taskComment.count({ where: { workspaceId, authorId: userId } }),
      prisma.taskComment.findFirst({
        where: { workspaceId, authorId: userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.task.findFirst({
        where: { workspaceId, createdById: userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.task.findMany({
        where: open,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'desc' }],
        take: options.take,
        select: TASK_LIST_SELECT,
      }),
    ]);
    return {
      openCount,
      overdueCount,
      doneRecentlyCount,
      createdCount,
      commentsCount,
      lastCommentAt: lastComment?.createdAt ?? null,
      lastTaskAt: lastTask?.createdAt ?? null,
      openTasks,
    };
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
