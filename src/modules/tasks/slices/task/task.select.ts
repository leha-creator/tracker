import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

/** Размещения задачи с проектом и статусом — для страницы задачи и строк списка. */
export const PLACEMENT_SELECT = {
  orderBy: { project: { name: 'asc' } },
  select: {
    projectId: true,
    statusId: true,
    project: { select: { name: true } },
    status: { select: { name: true, color: true, category: true } },
  },
} as const satisfies Prisma.Task$placementsArgs;

/** Поля строки списка задач (общие для списка пространства и вкладки проекта). */
export const TASK_LIST_SELECT = {
  id: true,
  number: true,
  title: true,
  priority: true,
  dueDate: true,
  assignee: { select: { id: true, name: true, image: true } },
  workspace: { select: { taskKey: true } },
  placements: PLACEMENT_SELECT,
} as const satisfies Prisma.TaskSelect;

export type TaskListRow = Prisma.TaskGetPayload<{ select: typeof TASK_LIST_SELECT }>;
