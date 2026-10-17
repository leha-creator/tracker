import type { StatusColor } from '@/modules/projects/client';
import type { SavedTaskViewDto, TaskLabelRefDto } from '@/modules/tasks/client';

/** Сохранённые фильтры списка и его область (для сохранения нового). */
export interface SavedViewsOptions {
  views: SavedTaskViewDto[];
  /** Пространство списка; нет — «Мои задачи». */
  workspaceId?: string;
  /** Проект — только вкладка «Список» проекта. */
  projectId?: string;
}

/** Значения для фильтров: страница собирает их из модулей workspaces и projects. */
export interface TaskListOptions {
  /** Текущий пользователь — в списке ответственных он представлен пунктом «Я». */
  currentUserId: string;
  /** Участники пространства; в «Моих задачах» фильтра по ответственному нет. */
  members?: { userId: string; name: string }[];
  /** Проекты пространства (только список пространства). */
  projects?: { id: string; name: string }[];
  /** Статусы проекта (только вкладка проекта). */
  statuses?: { id: string; name: string; color: StatusColor }[];
  /** Метки пространства. */
  labels?: TaskLabelRefDto[];
  /** Мои пространства (только «Мои задачи»). */
  workspaces?: { id: string; name: string }[];
  savedViews?: SavedViewsOptions;
  /** Выгрузка CSV (пространство и проект): адрес эндпоинта и проект вкладки. */
  csvExport?: { path: string; projectId?: string };
}
