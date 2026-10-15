import {
  serializeTaskListParams,
  type TaskListQuery,
  type TaskListScope,
} from '@/modules/tasks/client';

/** Адрес списка с запросом: без параметров — просто `basePath`. */
export function taskListHref(basePath: string, query: TaskListQuery, scope: TaskListScope): string {
  const search = serializeTaskListParams(query, scope);
  return search ? `${basePath}?${search}` : basePath;
}
