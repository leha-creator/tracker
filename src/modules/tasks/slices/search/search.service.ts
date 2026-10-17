import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

import { formatTaskKey, parseTaskNumberQuery } from '../../models';
import type { TaskSearchResultDto } from './search.dto';
import { searchRepository, type TaskSearchRow } from './search.repository';

const log = createLogger('tasks.search');

function toSearchResult(row: TaskSearchRow): TaskSearchResultDto {
  const placement = row.placements[0];
  return {
    taskId: row.id,
    number: row.number,
    key: formatTaskKey(row.number, row.workspace.taskKey),
    title: row.title,
    status: placement
      ? {
          name: placement.status.name,
          category: placement.status.category,
          projectName: placement.project.name,
        }
      : null,
    moreProjects: Math.max(0, row._count.placements - 1),
  };
}

/**
 * Поиск задач пространства для палитры Cmd+K: `42`, `#42`, `TSK-42` — задача с этим номером
 * первой, затем совпадения по части названия. Архивные задачи не находятся.
 */
export async function searchTasks(
  session: AuthSession,
  workspaceId: string,
  q: string,
  limit: number,
): Promise<TaskSearchResultDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const text = q.trim();
  if (!text || limit <= 0) return [];

  const number = parseTaskNumberQuery(text);
  const exact = number !== null ? await searchRepository.findByNumber(workspaceId, number) : null;
  const byTitle = await searchRepository.findByTitle(
    workspaceId,
    text,
    exact ? limit - 1 : limit,
    exact?.id,
  );
  const rows = exact ? [exact, ...byTitle] : byTitle;

  // Текст запроса не логируем: в нём могут быть названия задач.
  log.debug(
    {
      userId: session.user.id,
      workspaceId,
      qLength: text.length,
      byNumber: exact !== null,
      found: rows.length,
    },
    '[search.searchTasks]',
  );
  return rows.map(toSearchResult);
}
