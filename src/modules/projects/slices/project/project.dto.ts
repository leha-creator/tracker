import type { EntityIcon } from '@/shared/entity-icon';

import type { TasksByCategory } from '../../models';

export interface ProjectListItemDto {
  id: string;
  name: string;
  description: string | null;
  icon: EntityIcon;
  tasksCount: number;
  /** Задачи по категориям статусов: «К выполнению», «В работе», «Готово». */
  tasksByCategory: TasksByCategory;
  /** Открытые задачи со сроком раньше сегодняшнего. */
  overdueCount: number;
  /** Открытые задачи, где текущий пользователь — ответственный. */
  myOpenCount: number;
  /** Последнее изменение задач проекта или самого проекта. */
  lastActivityAt: Date;
  /** В архиве с этого момента; null — активный. */
  archivedAt: Date | null;
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  name: string;
  description: string | null;
  icon: EntityIcon;
  createdAt: Date;
  /** Число задач, размещённых в проекте (без архивных). */
  tasksCount: number;
  /** В архиве с этого момента (доска только для чтения); null — активный. */
  archivedAt: Date | null;
  /** Кто отправил в архив; null — активный или пользователь удалён. */
  archivedByName: string | null;
}
