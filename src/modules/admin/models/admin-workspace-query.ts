import type { SortDirection } from './admin-user-query';

/**
 * Запрос списка пространств админки. Живёт в URL, разбор нестрогий — как у пользователей.
 */

export const ADMIN_WORKSPACES_PAGE_SIZE = 50;
export const ADMIN_WORKSPACES_QUERY_MAX_LENGTH = 100;

export const ADMIN_WORKSPACE_SORTS = ['created', 'name'] as const;
export type AdminWorkspaceSort = (typeof ADMIN_WORKSPACE_SORTS)[number];

export const ADMIN_WORKSPACE_SORT_LABELS: Record<AdminWorkspaceSort, string> = {
  created: 'Создано',
  name: 'Пространство',
};

export const ADMIN_WORKSPACE_STATUSES = ['active', 'archived'] as const;
export type AdminWorkspaceStatus = (typeof ADMIN_WORKSPACE_STATUSES)[number];

export const ADMIN_WORKSPACE_STATUS_LABELS: Record<AdminWorkspaceStatus, string> = {
  active: 'Активные',
  archived: 'В архиве',
};

export interface AdminWorkspaceListQuery {
  /** Поиск по названию, адресу и ключу задач. */
  q: string;
  status: AdminWorkspaceStatus | null;
  sort: AdminWorkspaceSort;
  dir: SortDirection;
  page: number;
}

const DEFAULT_SORT: AdminWorkspaceSort = 'created';
const DEFAULT_DIRECTION: Record<AdminWorkspaceSort, SortDirection> = {
  created: 'desc',
  name: 'asc',
};
const PAGE_RE = /^[1-9]\d{0,5}$/;

export function defaultAdminWorkspaceListQuery(): AdminWorkspaceListQuery {
  return { q: '', status: null, sort: DEFAULT_SORT, dir: DEFAULT_DIRECTION[DEFAULT_SORT], page: 1 };
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isOneOf<T extends string>(values: readonly T[], item: string | undefined): item is T {
  return item !== undefined && (values as readonly string[]).includes(item);
}

/** `searchParams` страницы → запрос списка пространств. */
export function parseAdminWorkspaceListParams(raw: RawParams): AdminWorkspaceListQuery {
  const query = defaultAdminWorkspaceListQuery();
  query.q = (first(raw.q) ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, ADMIN_WORKSPACES_QUERY_MAX_LENGTH);
  const status = first(raw.status);
  query.status = isOneOf(ADMIN_WORKSPACE_STATUSES, status) ? status : null;
  const sort = first(raw.sort);
  if (isOneOf(ADMIN_WORKSPACE_SORTS, sort)) query.sort = sort;
  const dir = first(raw.dir);
  query.dir = dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIRECTION[query.sort];
  const page = first(raw.page);
  query.page = page && PAGE_RE.test(page) ? Number(page) : 1;
  return query;
}

/** Запрос → query string (без `?`); значения по умолчанию опущены. */
export function serializeAdminWorkspaceListParams(query: AdminWorkspaceListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort);
  if (query.dir !== DEFAULT_DIRECTION[query.sort]) params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

/** Изменение запроса; всё, кроме смены страницы, возвращает на первую страницу. */
export function patchAdminWorkspaceListQuery(
  query: AdminWorkspaceListQuery,
  patch: Partial<AdminWorkspaceListQuery>,
): AdminWorkspaceListQuery {
  return { ...query, page: 1, ...patch };
}

export function hasActiveAdminWorkspaceFilters(query: AdminWorkspaceListQuery): boolean {
  return query.q !== '' || query.status !== null;
}

/** Клик по заголовку: та же колонка — смена направления, другая — направление по умолчанию. */
export function toggleAdminWorkspaceSort(
  query: AdminWorkspaceListQuery,
  sort: AdminWorkspaceSort,
): AdminWorkspaceListQuery {
  const dir =
    query.sort === sort ? (query.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIRECTION[sort];
  return patchAdminWorkspaceListQuery(query, { sort, dir });
}
