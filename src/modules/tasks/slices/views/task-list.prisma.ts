import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

import {
  dueDateRange,
  parseTaskNumberQuery,
  TASK_LIST_ME,
  TASK_LIST_NONE,
  type SortDirection,
  type TaskListQuery,
  type TaskListScope,
  type TaskListSort,
} from '../../models';

export interface TaskListContext {
  workspaceId: string;
  /** Текущий пользователь — для `assignee=me`. */
  userId: string;
  /** Сегодня, `YYYY-MM-DD` (UTC). */
  today: string;
  scope: TaskListScope;
}

/** `YYYY-MM-DD` → Date в полночь UTC (колонка DATE без времени). */
function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Задача выполнена: есть размещения, и все они в статусах категории «Готово» (как `isTaskOverdue`). */
const TASK_DONE: Prisma.TaskWhereInput = {
  AND: [{ placements: { some: {} } }, { placements: { every: { status: { category: 'done' } } } }],
};

/** Фильтры по задаче. В проекте условие «не выполнена» для «Просрочено» добавляет `buildPlacementWhere`. */
export function buildTaskWhere(query: TaskListQuery, ctx: TaskListContext): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [];

  if (query.q) {
    const number = parseTaskNumberQuery(query.q);
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        ...(number !== null ? [{ number }] : []),
      ],
    });
  }

  if (query.priorities.length > 0) and.push({ priority: { in: query.priorities } });

  if (query.topLevelOnly) and.push({ parentId: null });

  if (query.assignees.length > 0) {
    const ids = query.assignees
      .filter((value) => value !== TASK_LIST_NONE)
      .map((value) => (value === TASK_LIST_ME ? ctx.userId : value));
    const or: Prisma.TaskWhereInput[] = [];
    if (ids.length > 0) or.push({ assigneeId: { in: [...new Set(ids)] } });
    if (query.assignees.includes(TASK_LIST_NONE)) or.push({ assigneeId: null });
    and.push({ OR: or });
  }

  if (query.due) {
    const range = dueDateRange(query.due, ctx.today);
    if (range.kind === 'none') {
      and.push({ dueDate: null });
    } else {
      and.push({
        dueDate: {
          ...(range.lt ? { lt: toDate(range.lt) } : {}),
          ...(range.gte ? { gte: toDate(range.gte) } : {}),
          ...(range.lte ? { lte: toDate(range.lte) } : {}),
        },
      });
      if (query.due === 'overdue' && ctx.scope === 'workspace') and.push({ NOT: TASK_DONE });
    }
  }

  if (ctx.scope === 'workspace') {
    if (query.categories.length > 0) {
      const categories = query.categories.filter((value) => value !== TASK_LIST_NONE);
      const or: Prisma.TaskWhereInput[] = [];
      if (categories.length > 0) {
        or.push({ placements: { some: { status: { category: { in: categories } } } } });
      }
      if (query.categories.includes(TASK_LIST_NONE)) or.push({ placements: { none: {} } });
      and.push({ OR: or });
    }
    if (query.projects.length > 0) {
      const projectIds = query.projects.filter((value) => value !== TASK_LIST_NONE);
      const or: Prisma.TaskWhereInput[] = [];
      if (projectIds.length > 0) {
        or.push({ placements: { some: { projectId: { in: projectIds } } } });
      }
      if (query.projects.includes(TASK_LIST_NONE)) or.push({ placements: { none: {} } });
      and.push({ OR: or });
    }
  }

  return { workspaceId: ctx.workspaceId, ...(and.length > 0 ? { AND: and } : {}) };
}

/** Размещения проекта: статус и «не выполнена» — по статусу в этом проекте, как на доске. */
export function buildPlacementWhere(
  query: TaskListQuery,
  ctx: Omit<TaskListContext, 'scope'> & { projectId: string },
): Prisma.TaskPlacementWhereInput {
  return {
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    ...(query.statuses.length > 0 ? { statusId: { in: query.statuses } } : {}),
    ...(query.due === 'overdue' ? { status: { category: { not: 'done' } } } : {}),
    task: buildTaskWhere(query, { ...ctx, scope: 'project' }),
  };
}

/** Порядок задач по полю; при равных значениях — новые сверху (номер уникален в пространстве). */
export function buildTaskOrderBy(
  sort: TaskListSort,
  dir: SortDirection,
): Prisma.TaskOrderByWithRelationInput[] {
  const byNumber: Prisma.TaskOrderByWithRelationInput = { number: 'desc' };
  switch (sort) {
    case 'number':
      return [{ number: dir }];
    case 'title':
      return [{ title: dir }, byNumber];
    // Порядок значений enum TaskPriority в Postgres: none < low < medium < high < urgent.
    case 'priority':
      return [{ priority: dir }, byNumber];
    case 'due':
      return [{ dueDate: { sort: dir, nulls: 'last' } }, byNumber];
    case 'status':
      // Статус есть только у размещения; в пространстве не используется (parseTaskListParams).
      return [byNumber];
  }
}

/** В проекте сортировка по статусу повторяет доску: колонка, позиция, id задачи (`comparePositions`). */
export function buildPlacementOrderBy(
  sort: TaskListSort,
  dir: SortDirection,
): Prisma.TaskPlacementOrderByWithRelationInput[] {
  if (sort === 'status') {
    return [{ status: { position: dir } }, { position: dir }, { taskId: dir }];
  }
  return buildTaskOrderBy(sort, dir).map((order) => ({ task: order }));
}
