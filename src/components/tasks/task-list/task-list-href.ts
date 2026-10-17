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

/** Ссылка на CSV текущего списка: те же фильтры и сортировка, без страницы. */
export function taskExportHref(
  path: string,
  query: TaskListQuery,
  scope: TaskListScope,
  projectId?: string,
): string {
  const params = new URLSearchParams(serializeTaskListParams({ ...query, page: 1 }, scope));
  if (projectId) params.set('projectId', projectId);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
