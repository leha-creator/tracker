import type { StatusColor } from '@/modules/projects/client';
import type { TaskLabelRefDto } from '@/modules/tasks/client';

/** Значения для фильтров: страница собирает их из модулей workspaces и projects. */
export interface TaskListOptions {
  /** Текущий пользователь — в списке ответственных он представлен пунктом «Я». */
  currentUserId: string;
  members: { userId: string; name: string }[];
  /** Проекты пространства (только список пространства). */
  projects?: { id: string; name: string }[];
  /** Статусы проекта (только вкладка проекта). */
  statuses?: { id: string; name: string; color: StatusColor }[];
  /** Метки пространства. */
  labels: TaskLabelRefDto[];
}
