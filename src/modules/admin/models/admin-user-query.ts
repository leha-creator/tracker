import { GLOBAL_ROLES, type GlobalRole } from '@/shared/access/global-role';

/**
 * Запрос списка пользователей админки. Живёт в URL (`searchParams`), поэтому разбор
 * нестрогий — некорректные значения отбрасываются, а не превращаются в ошибку.
 */

export const ADMIN_USERS_PAGE_SIZE = 50;
export const ADMIN_USERS_QUERY_MAX_LENGTH = 100;

export const ADMIN_USER_SORTS = ['created', 'name', 'email'] as const;
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];
export type SortDirection = 'asc' | 'desc';

export const ADMIN_USER_SORT_LABELS: Record<AdminUserSort, string> = {
  created: 'Регистрация',
  name: 'Пользователь',
  email: 'Email',
};

export const ADMIN_USER_STATUSES = ['active', 'banned'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export const ADMIN_USER_STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: 'Активные',
  banned: 'Заблокированные',
};

export interface AdminUserListQuery {
  /** Поиск по имени или email; пустая строка — без поиска. */
  q: string;
  role: GlobalRole | null;
  status: AdminUserStatus | null;
  sort: AdminUserSort;
  dir: SortDirection;
  /** Номер страницы с 1. */
  page: number;
}

const DEFAULT_SORT: AdminUserSort = 'created';

/** Направление при первом клике по колонке: новые — сверху, имена и email — по алфавиту. */
const DEFAULT_DIRECTION: Record<AdminUserSort, SortDirection> = {
  created: 'desc',
  name: 'asc',
  email: 'asc',
};

const PAGE_RE = /^[1-9]\d{0,5}$/;

export function defaultSortDirection(sort: AdminUserSort): SortDirection {
  return DEFAULT_DIRECTION[sort];
}

export function defaultAdminUserListQuery(): AdminUserListQuery {
  return {
    q: '',
    role: null,
    status: null,
    sort: DEFAULT_SORT,
    dir: DEFAULT_DIRECTION[DEFAULT_SORT],
    page: 1,
  };
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(values: readonly T[]) {
  return (item: string | undefined): item is T =>
    item !== undefined && (values as readonly string[]).includes(item);
}

const isRole = oneOf(GLOBAL_ROLES);
const isStatus = oneOf(ADMIN_USER_STATUSES);
const isSort = oneOf(ADMIN_USER_SORTS);

/** `searchParams` страницы → запрос списка пользователей. */
export function parseAdminUserListParams(raw: RawParams): AdminUserListQuery {
  const query = defaultAdminUserListQuery();

  query.q = (first(raw.q) ?? '').trim().replace(/\s+/g, ' ').slice(0, ADMIN_USERS_QUERY_MAX_LENGTH);

  const role = first(raw.role);
  query.role = isRole(role) ? role : null;
  const status = first(raw.status);
  query.status = isStatus(status) ? status : null;

  const sort = first(raw.sort);
  if (isSort(sort)) query.sort = sort;
  const dir = first(raw.dir);
  query.dir = dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIRECTION[query.sort];

  const page = first(raw.page);
  query.page = page && PAGE_RE.test(page) ? Number(page) : 1;
  return query;
}

/** Запрос → query string (без `?`): стабильный порядок ключей, значения по умолчанию опущены. */
export function serializeAdminUserListParams(query: AdminUserListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort);
  if (query.dir !== DEFAULT_DIRECTION[query.sort]) params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

/** Изменение запроса; всё, кроме смены страницы, возвращает на первую страницу. */
export function patchAdminUserListQuery(
  query: AdminUserListQuery,
  patch: Partial<AdminUserListQuery>,
): AdminUserListQuery {
  return { ...query, page: 1, ...patch };
}

export function hasActiveAdminUserFilters(query: AdminUserListQuery): boolean {
  return query.q !== '' || query.role !== null || query.status !== null;
}

/** Сброс поиска и фильтров; сортировка сохраняется. */
export function clearAdminUserFilters(query: AdminUserListQuery): AdminUserListQuery {
  return patchAdminUserListQuery(query, { q: '', role: null, status: null });
}

/** Клик по заголовку колонки: та же колонка — смена направления, другая — направление по умолчанию. */
export function toggleAdminUserSort(
  query: AdminUserListQuery,
  sort: AdminUserSort,
): AdminUserListQuery {
  const dir =
    query.sort === sort ? (query.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIRECTION[sort];
  return patchAdminUserListQuery(query, { sort, dir });
}
