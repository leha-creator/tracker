import type { StatusCategory, StatusColor } from '@/modules/projects';

import type { TaskPriority } from '../../models';

export interface TaskUserDto {
  userId: string;
  name: string;
  image: string | null;
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
  createdAt: Date;
  updatedAt: Date;
  placements: TaskPlacementDto[];
  /** Может ли текущий пользователь удалить задачу (автор или владелец пространства). */
  canDelete: boolean;
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
  createdAt: Date;
}

export interface TaskPageDto {
  items: TaskListItemDto[];
  /** Курсор следующей страницы или null, если это последняя. */
  nextCursor: string | null;
}
