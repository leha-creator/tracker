import type { StatusCategory, StatusColor } from '@/modules/projects';

import type { TaskPriority } from '../../models';
import type { SubtaskProgress } from '../../models/task-tree';
import type { TaskAncestorDto } from '../subtask/subtask.dto';

export interface TaskUserDto {
  userId: string;
  name: string;
  image: string | null;
}

/**
 * Создано через токен MCP от имени человека (личный токен): «через Claude Code». У агента
 * пространства пометки нет — автор и так агент.
 */
export interface CreatedViaDto {
  tokenName: string;
}

/** Размещение задачи в проекте: проект и статус в нём. */
export interface TaskPlacementDto {
  projectId: string;
  projectName: string;
  statusId: string;
  statusName: string;
  statusColor: StatusColor;
  statusCategory: StatusCategory;
}

export interface TaskDto {
  id: string;
  number: number;
  /** `#42` */
  key: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  /** `YYYY-MM-DD` или null. */
  dueDate: string | null;
  isOverdue: boolean;
  assignee: TaskUserDto | null;
  createdBy: TaskUserDto | null;
  /** Создана агентом по личному токену автора; null — вручную или самим агентом. */
  createdVia: CreatedViaDto | null;
  createdAt: Date;
  updatedAt: Date;
  placements: TaskPlacementDto[];
  /** Может ли текущий пользователь удалить задачу (автор или владелец пространства). */
  canDelete: boolean;
  /** Предки от корня к родителю; пусто — задача верхнего уровня. */
  ancestors: TaskAncestorDto[];
  /** Сколько подзадач всех уровней удалится вместе с задачей. */
  descendantCount: number;
  /** Прогресс по прямым подзадачам. */
  subtaskProgress: SubtaskProgress;
}

export interface TaskListItemDto {
  id: string;
  number: number;
  key: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  isOverdue: boolean;
  assignee: TaskUserDto | null;
  placements: TaskPlacementDto[];
  /** Родитель подзадачи; null — задача верхнего уровня. */
  parent: TaskAncestorDto | null;
}

/** Задача, найденная по номеру из внешней ссылки (системное чтение для интеграций). */
export interface TaskRefDto {
  taskId: string;
  number: number;
  key: string;
  title: string;
  assigneeId: string | null;
  createdById: string | null;
}
