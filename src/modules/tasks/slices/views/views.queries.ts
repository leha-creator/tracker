import 'server-only';

import { isEntityId } from '@/modules/projects';
import { isWorkspaceMember } from '@/modules/workspaces';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  comparePositions,
  formatTaskKey,
  isTaskOpen,
  isTaskOverdue,
  MEMBER_DONE_RECENT_DAYS,
  MEMBER_OPEN_TASKS_LIMIT,
  pageCountOf,
  TASK_LIST_PAGE_SIZE,
  toIsoDate,
  type SubtaskProgress,
  type TaskListQuery,
  type TaskListScope,
} from '../../models';
import { getSubtaskProgress } from '../subtask/subtask.service';
import { toLabelRefs, toParentRef, toTaskListItem, toUserDto } from '../task/task.mapper';
import {
  buildPlacementOrderBy,
  buildPlacementWhere,
  buildTaskOrderBy,
  buildTaskWhere,
} from './task-list.prisma';
import type {
  BoardCardDto,
  BoardCardsDto,
  MemberTaskSummaryDto,
  TaskListPageDto,
  TaskSummaryDto,
} from './views.dto';
import { viewsRepository, type BoardPlacementRow } from './views.repository';

const log = createLogger('tasks.views');

function toBoardCard(
  row: BoardPlacementRow,
  today: string,
  progress: Map<string, SubtaskProgress>,
): BoardCardDto {
  const dueDate = row.task.dueDate ? toIsoDate(row.task.dueDate) : null;
  const { taskKey } = row.task.workspace;
  return {
    taskId: row.taskId,
    number: row.task.number,
    key: formatTaskKey(row.task.number, taskKey),
    title: row.task.title,
    priority: row.task.priority,
    dueDate,
    isOverdue: isTaskOverdue(dueDate, today, [row.status.category]),
    assignee: toUserDto(row.task.assignee),
    parent: toParentRef(row.task.parent, taskKey),
    subtaskProgress: progress.get(row.taskId) ?? null,
    labels: toLabelRefs(row.task.labels),
  };
}

/** Карточки доски проекта, сгруппированные по статусам. Колонки (статусы) — из модуля projects. */
export async function getBoardCards(
  session: AuthSession,
  workspaceId: string,
  projectId: string,
): Promise<BoardCardsDto> {
  await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(projectId)) throw new NotFoundError('Проект не найден');

  const rows = await viewsRepository.listBoardPlacements(workspaceId, projectId);
  rows.sort(comparePositions);
  // Прогресс — одним запросом и только для карточек, у которых есть подзадачи.
  const withSubtasks = rows.filter((row) => row.task._count.subtasks > 0).map((row) => row.taskId);
  const progress =
    withSubtasks.length > 0
      ? await getSubtaskProgress(workspaceId, withSubtasks)
      : new Map<string, SubtaskProgress>();

  const today = toIsoDate(new Date());
  const cards: BoardCardsDto = {};
  for (const row of rows) {
    (cards[row.statusId] ??= []).push(toBoardCard(row, today, progress));
  }
  log.debug(
    {
      userId: session.user.id,
      workspaceId,
      projectId,
      cards: rows.length,
      withParent: rows.filter((row) => row.task.parent).length,
      withSubtasks: withSubtasks.length,
    },
    '[views.getBoardCards]',
  );
  return cards;
}

interface ListRequest {
  scope: TaskListScope;
  workspaceId: string;
  projectId?: string;
  query: TaskListQuery;
  userId: string;
}

function logList(request: ListRequest, page: TaskListPageDto, clampedFrom?: number) {
  const { query } = request;
  if (clampedFrom !== undefined) {
    log.debug(
      { workspaceId: request.workspaceId, requested: clampedFrom, pageCount: page.pageCount },
      '[views.listTasks] page clamped',
    );
  }
  // Текст поиска не логируем: в нём могут быть названия задач.
  log.debug(
    {
      userId: request.userId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      scope: request.scope,
      filters: {
        statuses: query.statuses.length,
        categories: query.categories.length,
        projects: query.projects.length,
        priorities: query.priorities.length,
        assignees: query.assignees.length,
        labels: query.labels.length,
        due: query.due,
        topLevelOnly: query.topLevelOnly,
        archived: query.archived,
      },
      hasQuery: query.q !== '',
      sort: query.sort,
      dir: query.dir,
      page: page.page,
      total: page.total,
    },
    '[views.listTasks]',
  );
}

/**
 * Загружает страницу; если запрошенная за пределами (старая ссылка, задачи удалили) —
 * повторяет запрос с последней страницей.
 */
async function loadPage<Row>(
  requested: number,
  fetch: (skip: number) => Promise<{ total: number; rows: Row[] }>,
): Promise<{ total: number; rows: Row[]; page: number; pageCount: number; clamped: boolean }> {
  const first = await fetch((requested - 1) * TASK_LIST_PAGE_SIZE);
  const pageCount = pageCountOf(first.total);
  if (requested <= pageCount) return { ...first, page: requested, pageCount, clamped: false };
  const last = await fetch((pageCount - 1) * TASK_LIST_PAGE_SIZE);
  // Между запросами число задач могло измениться — пересчитываем.
  const lastCount = pageCountOf(last.total);
  return { ...last, page: Math.min(pageCount, lastCount), pageCount: lastCount, clamped: true };
}

/** Список задач пространства: фильтры, сортировка, страница. */
export async function listTasks(
  session: AuthSession,
  workspaceId: string,
  query: TaskListQuery,
): Promise<TaskListPageDto> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  const today = toIsoDate(new Date());
  const where = buildTaskWhere(query, {
    workspaceId,
    userId: access.userId,
    today,
    scope: 'workspace',
  });
  const orderBy = buildTaskOrderBy(query.sort, query.dir);

  const result = await loadPage(query.page, (skip) =>
    viewsRepository.listTaskPage({ where, orderBy, skip, take: TASK_LIST_PAGE_SIZE }),
  );
  const page: TaskListPageDto = {
    items: result.rows.map((row) => toTaskListItem(row, today)),
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
    pageSize: TASK_LIST_PAGE_SIZE,
  };
  logList(
    { scope: 'workspace', workspaceId, query, userId: access.userId },
    page,
    result.clamped ? query.page : undefined,
  );
  return page;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Задачи участника пространства для его публичного профиля. Смотрящий — участник пространства;
 * цель не участник — `NotFoundError` (не раскрываем, кто есть в чужих пространствах).
 */
export async function getMemberTaskSummary(
  session: AuthSession,
  workspaceId: string,
  userId: string,
): Promise<MemberTaskSummaryDto> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    log.warn(
      { viewerId: access.userId, workspaceId, userId },
      '[views.memberSummary] not a member',
    );
    throw new NotFoundError('Участник не найден');
  }

  const now = new Date();
  const today = toIsoDate(now);
  const row = await viewsRepository.memberSummary(workspaceId, userId, {
    today: new Date(today),
    since: new Date(now.getTime() - MEMBER_DONE_RECENT_DAYS * DAY_MS),
    take: MEMBER_OPEN_TASKS_LIMIT,
  });
  const activity = [row.lastCommentAt, row.lastTaskAt].filter((date) => date !== null);
  const summary: MemberTaskSummaryDto = {
    openCount: row.openCount,
    overdueCount: row.overdueCount,
    doneRecentlyCount: row.doneRecentlyCount,
    createdCount: row.createdCount,
    commentsCount: row.commentsCount,
    lastActivityAt:
      activity.length > 0 ? new Date(Math.max(...activity.map((date) => date.getTime()))) : null,
    openTasks: row.openTasks.map((task) => toTaskListItem(task, today)),
  };
  log.debug(
    {
      viewerId: access.userId,
      workspaceId,
      userId,
      open: summary.openCount,
      overdue: summary.overdueCount,
      doneRecently: summary.doneRecentlyCount,
    },
    '[views.memberSummary]',
  );
  return summary;
}

/** Вкладка «Список» проекта: строки — размещения проекта; «просрочено» — по статусу в проекте. */
export async function listProjectTasks(
  session: AuthSession,
  workspaceId: string,
  projectId: string,
  query: TaskListQuery,
): Promise<TaskListPageDto> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(projectId)) throw new NotFoundError('Проект не найден');
  const today = toIsoDate(new Date());
  const where = buildPlacementWhere(query, {
    workspaceId,
    projectId,
    userId: access.userId,
    today,
  });
  const orderBy = buildPlacementOrderBy(query.sort, query.dir);

  const result = await loadPage(query.page, (skip) =>
    viewsRepository.listPlacementPage({ where, orderBy, skip, take: TASK_LIST_PAGE_SIZE }),
  );
  const page: TaskListPageDto = {
    items: result.rows.map((row) => ({
      ...toTaskListItem(row.task, today),
      isOverdue: isTaskOverdue(row.task.dueDate ? toIsoDate(row.task.dueDate) : null, today, [
        row.status.category,
      ]),
    })),
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
    pageSize: TASK_LIST_PAGE_SIZE,
  };
  logList(
    { scope: 'project', workspaceId, projectId, query, userId: access.userId },
    page,
    result.clamped ? query.page : undefined,
  );
  return page;
}

/** Предел числа задач в одном запросе кратких данных. */
const TASK_SUMMARIES_LIMIT = 100;

/**
 * Номер, название и «выполнена ли» задач пространства по id — для ссылок из других модулей
 * (документы). Чужие и несуществующие id пропускаются.
 */
export async function getTaskSummaries(
  session: AuthSession,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<TaskSummaryDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const ids = [...new Set(taskIds)].filter(isEntityId).slice(0, TASK_SUMMARIES_LIMIT);
  if (ids.length === 0) return [];

  const rows = await viewsRepository.listTaskSummaries(workspaceId, ids);
  log.debug(
    { workspaceId, userId: session.user.id, requested: taskIds.length, found: rows.length },
    '[views.getTaskSummaries]',
  );
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    key: formatTaskKey(row.number, row.workspace.taskKey),
    title: row.title,
    isDone: !isTaskOpen(row.placements.map((placement) => placement.status.category)),
  }));
}
