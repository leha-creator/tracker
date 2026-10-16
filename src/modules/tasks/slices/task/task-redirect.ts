/** Параметр панели задачи в адресе страницы (`?task=12`). */
const TASK_PANEL_PARAM = 'task';
const COMMENTS_PARAM = 'comments';

/** Максимальная длина `returnTo`: адрес списка с фильтрами укладывается с запасом. */
export const RETURN_TO_MAX_LENGTH = 2000;

/**
 * Адрес возврата из формы — пользовательский ввод. Принимается только относительный путь
 * внутри текущего пространства (`/w/<slug>/…`): без схемы, `//`, `\`, `..` и управляющих символов.
 * Иначе — `null` (вызывающий код уходит на запасной адрес).
 */
export function parseReturnPath(returnTo: unknown, workspaceSlug: string): string | null {
  if (typeof returnTo !== 'string' || returnTo === '' || returnTo.length > RETURN_TO_MAX_LENGTH) {
    return null;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(returnTo)) return null;

  const prefix = `/w/${workspaceSlug}`;
  const [path = ''] = returnTo.split(/[?#]/, 1);
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return null;
  // `/w/slug/../other` или `/w/slug/%2e%2e/` — выход за пределы пространства.
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || /%2e/i.test(segment))) {
    return null;
  }
  if (path.includes('//')) return null;
  return returnTo.split('#', 1)[0] ?? null;
}

/** Путь возврата с открытой панелью (`task=<n>`) или закрытой (`null`). */
export function withTaskPanel(returnPath: string, task: number | null): string {
  const [path = '', query = ''] = returnPath.split('?', 2);
  const params = new URLSearchParams(query);
  params.delete(COMMENTS_PARAM);
  if (task === null) params.delete(TASK_PANEL_PARAM);
  else params.set(TASK_PANEL_PARAM, String(task));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
