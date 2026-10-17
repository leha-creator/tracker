import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  exportFileName,
  formatTaskKey,
  TASK_CSV_COLUMNS,
  TASK_EXPORT_MAX_ROWS,
  TASK_PRIORITY_LABELS,
  toCsv,
  toIsoDate,
  type TaskListQuery,
} from '../../models';
import {
  buildPlacementOrderBy,
  buildPlacementWhere,
  buildTaskOrderBy,
  buildTaskWhere,
} from './task-list.prisma';
import { viewsRepository, type ExportTaskRow } from './views.repository';

const log = createLogger('tasks.export');

export interface TaskExportResult {
  csv: string;
  fileName: string;
  rows: number;
  /** Задач по фильтру больше `TASK_EXPORT_MAX_ROWS` — в файле только первые. */
  truncated: boolean;
}

/**
 * Выгрузка списка задач в CSV: те же фильтры и сортировка, что на странице (пространство или
 * вкладка проекта), без пагинации, не больше `TASK_EXPORT_MAX_ROWS` строк.
 */
export async function exportTasks(
  session: AuthSession,
  input: { workspaceId: string; workspaceSlug: string; query: TaskListQuery; projectId?: string },
): Promise<TaskExportResult> {
  const started = performance.now();
  const { workspaceId, workspaceSlug, query, projectId } = input;
  const access = await requireWorkspaceAccess(session, workspaceId);
  if (projectId !== undefined && !isEntityId(projectId)) {
    throw new NotFoundError('Проект не найден');
  }
  const now = new Date();
  const today = toIsoDate(now);
  const ctx = { workspaceId, userId: access.userId, today };
  // На один больше лимита — чтобы узнать, обрезан ли файл, без отдельного count.
  const take = TASK_EXPORT_MAX_ROWS + 1;

  const fetched =
    projectId === undefined
      ? await viewsRepository.listTasksForExport({
          where: buildTaskWhere(query, { ...ctx, scope: 'workspace' }),
          orderBy: buildTaskOrderBy(query.sort, query.dir),
          take,
        })
      : await viewsRepository.listProjectTasksForExport({
          where: buildPlacementWhere(query, { ...ctx, projectId }),
          orderBy: buildPlacementOrderBy(query.sort, query.dir),
          take,
        });
  const truncated = fetched.length > TASK_EXPORT_MAX_ROWS;
  const rows = truncated ? fetched.slice(0, TASK_EXPORT_MAX_ROWS) : fetched;

  const origin = getEnv().BETTER_AUTH_URL.replace(/\/+$/, '');
  const csv = toCsv(
    rows.map((row) => toCsvRow(row, `${origin}/w/${workspaceSlug}/tasks/`)),
    TASK_CSV_COLUMNS,
  );
  log.info(
    {
      workspaceId,
      userId: access.userId,
      scope: projectId === undefined ? 'workspace' : 'project',
      projectId,
      rows: rows.length,
      truncated,
      durationMs: Math.round(performance.now() - started),
    },
    '[tasks.export] exported',
  );
  return { csv, fileName: exportFileName(workspaceSlug, now), rows: rows.length, truncated };
}

function toCsvRow(row: ExportTaskRow, taskUrlBase: string) {
  const { taskKey } = row.workspace;
  return {
    key: formatTaskKey(row.number, taskKey),
    title: row.title,
    statuses: row.placements.map(
      (placement) => `${placement.project.name}: ${placement.status.name}`,
    ),
    priority: TASK_PRIORITY_LABELS[row.priority],
    assignee: row.assignee?.name ?? null,
    dueDate: row.dueDate ? toIsoDate(row.dueDate) : null,
    labels: row.labels.map(({ label }) => label.name),
    parentKey: row.parent ? formatTaskKey(row.parent.number, taskKey) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    url: `${taskUrlBase}${row.number}`,
  };
}
