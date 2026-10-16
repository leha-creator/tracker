import { taskNumberSchema } from '@/modules/tasks/client';

/** Параметр адреса, в котором живёт панель задачи: `?task=12` или `?task=new`. */
export const TASK_PANEL_PARAM = 'task';
/** Режим ленты комментариев (`?comments=all`) — относится к открытой задаче. */
export const TASK_COMMENTS_PARAM = 'comments';
/** Родитель новой задачи (`?task=new&parent=12`) — форма создаёт подзадачу. */
export const TASK_PARENT_PARAM = 'parent';

export type TaskPanelState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'view'; number: number };

/** Что показать в панели. Мусор в параметре — панель закрыта (без 404 страницы). */
export function parseTaskPanelParam(raw: string | string[] | undefined): TaskPanelState {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return { mode: 'closed' };
  if (value === 'new') return { mode: 'new' };
  const parsed = taskNumberSchema.safeParse(value);
  return parsed.success ? { mode: 'view', number: parsed.data } : { mode: 'closed' };
}

type SearchInput = URLSearchParams | string | Record<string, string | string[] | undefined>;

function toSearchParams(search: SearchInput): URLSearchParams {
  if (typeof search === 'string' || search instanceof URLSearchParams) {
    return new URLSearchParams(search);
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  return params;
}

function withSearch(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Адрес текущей страницы с открытой (`number` / `'new'`) или закрытой (`null`) панелью.
 * Остальные параметры (фильтры, сортировка списка) сохраняются; режим комментариев и родитель
 * новой задачи сбрасываются. `parent` — номер родителя для формы новой подзадачи.
 */
export function taskPanelHref(
  pathname: string,
  search: SearchInput,
  task: number | 'new' | null,
  options: { parent?: number } = {},
): string {
  const params = toSearchParams(search);
  params.delete(TASK_COMMENTS_PARAM);
  params.delete(TASK_PARENT_PARAM);
  if (task === null) params.delete(TASK_PANEL_PARAM);
  else params.set(TASK_PANEL_PARAM, String(task));
  if (task === 'new' && options.parent !== undefined) {
    params.set(TASK_PARENT_PARAM, String(options.parent));
  }
  return withSearch(pathname, params);
}

/** Номер родителя для формы новой подзадачи (`?parent=12`); мусор — null (обычная задача). */
export function parseTaskParentParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = taskNumberSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Страница создания задачи; с `parent` — подзадачи этой задачи. */
export function newTaskPageHref(workspaceSlug: string, parent?: number): string {
  const base = `/w/${workspaceSlug}/tasks/new`;
  return parent === undefined ? base : `${base}?${TASK_PARENT_PARAM}=${parent}`;
}

/** Адрес с изменённым параметром (например, `comments=all`), остальное — без изменений. */
export function withSearchParam(
  pathname: string,
  search: SearchInput,
  key: string,
  value: string | null,
): string {
  const params = toSearchParams(search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return withSearch(pathname, params);
}

/** Полноэкранная страница задачи. */
export function taskPageHref(workspaceSlug: string, number: number): string {
  return `/w/${workspaceSlug}/tasks/${number}`;
}
