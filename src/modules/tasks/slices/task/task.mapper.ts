import 'server-only';

import { parseStatusColor } from '@/modules/projects';

import { formatTaskKey, isTaskOverdue, toIsoDate } from '../../models';
import type { TaskRow } from './task.repository';
import type { TaskListRow } from './task.select';
import type { TaskPlacementDto, TaskUserDto } from './task.dto';

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
