import 'server-only';

import { parseStatusColor } from '@/modules/projects';

import { formatTaskKey, isTaskOverdue, toIsoDate } from '../../models';
import type { TaskRow } from './task.repository';
import type { TaskListRow } from './task.select';
import type { TaskAncestorDto } from '../subtask/subtask.dto';
import type { TaskListItemDto, TaskPlacementDto, CreatedViaDto, TaskUserDto } from './task.dto';

type PlacementRow = TaskRow['placements'][number];

export function toPlacementDto(row: PlacementRow): TaskPlacementDto {
  return {
    projectId: row.projectId,
    projectName: row.project.name,
    statusId: row.statusId,
    statusName: row.status.name,
    statusColor: parseStatusColor(row.status.color),
    statusCategory: row.status.category,
  };
}

export function toUserDto(
  user: { id: string; name: string; image?: string | null } | null,
): TaskUserDto | null {
  return user ? { userId: user.id, name: user.name, image: user.image ?? null } : null;
}

/**
 * Пометка «через агента»: токен, через который создано, если автор — человек. У автора-агента
 * пометку не показываем — и так видно, что это агент.
 */
export function toCreatedVia(
  author: { isAgent: boolean } | null,
  token: { name: string } | null,
): CreatedViaDto | null {
  if (!token || !author || author.isAgent) return null;
  return { tokenName: token.name };
}

/** Родитель задачи для метки «↳ TSK-12» на карточке и в списках. */
export function toParentRef(
  parent: { number: number; title: string } | null,
  workspaceTaskKey: string | null,
): TaskAncestorDto | null {
  return parent
    ? {
        number: parent.number,
        key: formatTaskKey(parent.number, workspaceTaskKey),
        title: parent.title,
      }
    : null;
}

/** Строка списка задач (списки пространства, проекта, подзадачи). */
export function toTaskListItem(row: TaskListRow, today: string): TaskListItemDto {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    priority: row.priority,
    parent: toParentRef(row.parent, row.workspace.taskKey),
    ...toTaskSummary(row, today),
  };
}

/** Общие поля карточки/строки: ключ, срок, просрочка, размещения. */
export function toTaskSummary(row: TaskRow | TaskListRow, today: string) {
  const dueDate = row.dueDate ? toIsoDate(row.dueDate) : null;
  const placements = row.placements.map(toPlacementDto);
  return {
    key: formatTaskKey(row.number, row.workspace.taskKey),
    dueDate,
    isOverdue: isTaskOverdue(
      dueDate,
      today,
      placements.map((placement) => placement.statusCategory),
    ),
    assignee: toUserDto(row.assignee),
    placements,
  };
}
