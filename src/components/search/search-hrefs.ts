import { taskPanelHref } from '@/components/tasks/task-panel/task-panel-href';

/** Страницы пространства, на которых живёт панель задачи (`?task=`): список задач, доска и список проекта. */
const TASK_PANEL_PAGE_RE = /^\/w\/[^/]+\/(?:tasks|projects\/[^/]+\/(?:board|list))$/;

/**
 * Куда вести из палитры к задаче (`number`) или к форме новой задачи (`'new'`): панель поверх
 * текущей страницы, если она её поддерживает, иначе — панель поверх «Задач» пространства.
 */
export function paletteTaskHref(
  pathname: string,
  search: string,
  workspaceSlug: string,
  task: number | 'new',
): string {
  if (pathname.startsWith(`/w/${workspaceSlug}/`) && TASK_PANEL_PAGE_RE.test(pathname)) {
    return taskPanelHref(pathname, search, task);
  }
  return taskPanelHref(`/w/${workspaceSlug}/tasks`, '', task);
}

export function documentHref(workspaceSlug: string, documentId: string): string {
  return `/w/${workspaceSlug}/docs/${documentId}`;
}

export function memberHref(workspaceSlug: string, userId: string): string {
  return `/w/${workspaceSlug}/members/${userId}`;
}
