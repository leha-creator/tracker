import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import { TASK_LIST_SELECT } from '../task/task.select';
import { openTaskWhere } from '../views/task-list.prisma';

/** Даты агрегатов — полночь UTC (колонка срока — DATE без времени). */
export interface DashboardDates {
  today: Date;
  /** Последний день «на неделе» включительно. */
  weekEnd: Date;
  /** Начало окна «закрыто недавно». */
  doneSince: Date;
}

// Read-модель обзора. Каждый запрос — с workspaceId в where (защита от IDOR).
export const dashboardRepository = {
  async aggregate(workspaceId: string, dates: DashboardDates, overdueLimit: number) {
    const open = {
      workspaceId,
      archivedAt: null,
      ...openTaskWhere(),
    } satisfies Prisma.TaskWhereInput;
    const overdue = { ...open, dueDate: { lt: dates.today } } satisfies Prisma.TaskWhereInput;
    // Открытое размещение: статус в этом проекте не «Готово», задача и проект не в архиве.
    const openPlacement = {
      workspaceId,
      status: { category: { not: 'done' } },
      task: { archivedAt: null },
      project: { archivedAt: null },
    } satisfies Prisma.TaskPlacementWhereInput;

    const [
      openCount,
      overdueCount,
      dueWeekCount,
      unassignedCount,
      doneLast7Count,
      openByAssignee,
      overdueByAssignee,
      openByProject,
      overdueByProject,
      projects,
      overdueTasks,
    ] = await prisma.$transaction([
      prisma.task.count({ where: open }),
      prisma.task.count({ where: overdue }),
      prisma.task.count({ where: { ...open, dueDate: { gte: dates.today, lte: dates.weekEnd } } }),
      prisma.task.count({ where: { ...open, assigneeId: null } }),
      // В истории статуса категория не хранится (только id и имя), поэтому «закрыто за 7 дней» —
      // выполненные задачи, у которых размещение в статусе «Готово» менялось в этом окне.
      prisma.task.count({
        where: {
          workspaceId,
          archivedAt: null,
          placements: {
            some: { status: { category: 'done' }, updatedAt: { gte: dates.doneSince } },
            every: { status: { category: 'done' } },
          },
        },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: open,
        orderBy: { assigneeId: 'asc' },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: overdue,
        orderBy: { assigneeId: 'asc' },
        _count: { _all: true },
      }),
      prisma.taskPlacement.groupBy({
        by: ['projectId'],
        where: openPlacement,
        orderBy: { projectId: 'asc' },
        _count: { _all: true },
      }),
      prisma.taskPlacement.groupBy({
        by: ['projectId'],
        where: { ...openPlacement, task: { archivedAt: null, dueDate: { lt: dates.today } } },
        orderBy: { projectId: 'asc' },
        _count: { _all: true },
      }),
      prisma.project.findMany({
        where: { workspaceId, archivedAt: null },
        select: { id: true, name: true },
      }),
      prisma.task.findMany({
        where: overdue,
        orderBy: [{ dueDate: 'asc' }, { number: 'desc' }],
        take: overdueLimit,
        select: TASK_LIST_SELECT,
      }),
    ]);

    const count = (row: { _count?: { _all?: number } | true }) =>
      typeof row._count === 'object' ? (row._count._all ?? 0) : 0;
    return {
      counts: {
        open: openCount,
        overdue: overdueCount,
        dueWeek: dueWeekCount,
        unassigned: unassignedCount,
        doneLast7: doneLast7Count,
      },
      openByAssignee: openByAssignee.map((row) => ({ id: row.assigneeId, count: count(row) })),
      overdueByAssignee: overdueByAssignee.map((row) => ({
        id: row.assigneeId,
        count: count(row),
      })),
      openByProject: openByProject.map((row) => ({ id: row.projectId, count: count(row) })),
      overdueByProject: overdueByProject.map((row) => ({ id: row.projectId, count: count(row) })),
      projects,
      overdueTasks,
    };
  },
};
