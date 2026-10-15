import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { comparePositions, formatTaskKey, isTaskOverdue, toIsoDate } from '../../models';
import { toUserDto } from '../task/task.mapper';
import type { BoardCardDto, BoardCardsDto } from './views.dto';
import { viewsRepository, type BoardPlacementRow } from './views.repository';

const log = createLogger('tasks.views');

function toBoardCard(row: BoardPlacementRow, today: string): BoardCardDto {
  const dueDate = row.task.dueDate ? toIsoDate(row.task.dueDate) : null;
  return {
    taskId: row.taskId,
    number: row.task.number,
    key: formatTaskKey(row.task.number),
    title: row.task.title,
    priority: row.task.priority,
    dueDate,
    isOverdue: isTaskOverdue(dueDate, today, [row.status.category]),
    assignee: toUserDto(row.task.assignee),
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

  const today = toIsoDate(new Date());
  const cards: BoardCardsDto = {};
  for (const row of rows) {
    (cards[row.statusId] ??= []).push(toBoardCard(row, today));
  }
  log.debug(
    { userId: session.user.id, workspaceId, projectId, cards: rows.length },
    '[views.getBoardCards]',
  );
  return cards;
}
