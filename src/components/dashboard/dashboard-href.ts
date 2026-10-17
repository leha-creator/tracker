import {
  defaultTaskListQuery,
  serializeTaskListParams,
  type TaskListQuery,
} from '@/modules/tasks/client';

/** Список задач пространства с фильтром — цель плиток и строк обзора. */
export function dashboardTasksHref(workspaceSlug: string, patch: Partial<TaskListQuery>): string {
  const search = serializeTaskListParams(
    { ...defaultTaskListQuery('workspace'), ...patch },
    'workspace',
  );
  const base = `/w/${workspaceSlug}/tasks`;
  return search ? `${base}?${search}` : base;
}

/** «Открытые» в фильтрах списка: не «Готово» или вне проектов. */
export const OPEN_CATEGORIES: TaskListQuery['categories'] = ['todo', 'in_progress', 'none'];
