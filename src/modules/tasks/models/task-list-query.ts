import { isEntityId, STATUS_CATEGORIES, type StatusCategory } from '@/modules/projects/client';

import { TASK_PRIORITIES, type TaskPriority } from './task-priority';

/**
 * Запрос списка задач: фильтры, сортировка и страница. Живёт в URL (`searchParams`),
 * поэтому разбор нестрогий — некорректные значения отбрасываются, а не превращаются в ошибку.
 */

/** Список задач пространства (`/tasks`) или вкладка «Список» проекта. */
export type TaskListScope = 'workspace' | 'project';

export const TASK_LIST_PAGE_SIZE = 50;
/** Максимум значений в одном фильтре. */
export const TASK_LIST_MAX_VALUES = 20;
/** Максимальная длина строки поиска. */
export const TASK_LIST_QUERY_MAX_LENGTH = 100;

export const TASK_LIST_SORTS = ['number', 'title', 'priority', 'due', 'status'] as const;
export type TaskListSort = (typeof TASK_LIST_SORTS)[number];
export type SortDirection = 'asc' | 'desc';

export const TASK_LIST_SORT_LABELS: Record<TaskListSort, string> = {
  number: 'Номер',
  title: 'Название',
  priority: 'Приоритет',
  due: 'Срок',
  status: 'Статус',
};

export const TASK_DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const;
export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number];

export const TASK_DUE_FILTER_LABELS: Record<TaskDueFilter, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  week: 'На 7 дней',
  none: 'Без срока',
};

/** Специальные значения фильтров: «Вне проектов» / «Не назначен» и «Я». */
export const TASK_LIST_NONE = 'none';
export const TASK_LIST_ME = 'me';

/** Значение `level` в URL: только задачи верхнего уровня. */
export const TASK_LIST_LEVEL_TOP = 'top';

export type TaskCategoryFilter = StatusCategory | typeof TASK_LIST_NONE;

export interface TaskListQuery {
  /** Поиск по названию или номеру (`#42`, `42`, `TSK-42`); пустая строка — без поиска. */
  q: string;
  /** Статусы проекта (только в проекте). */
  statuses: string[];
  /** Категории статуса; `none` — задачи вне проектов (только в пространстве). */
  categories: TaskCategoryFilter[];
  /** id проектов; `none` — задачи вне проектов (только в пространстве). */
  projects: string[];
  priorities: TaskPriority[];
  /** id участников, `me` или `none` (не назначен). */
  assignees: string[];
  due: TaskDueFilter | null;
  /** Только задачи верхнего уровня (без подзадач), URL `level=top`. */
  topLevelOnly: boolean;
  sort: TaskListSort;
  dir: SortDirection;
  /** Номер страницы с 1. */
  page: number;
}

const DEFAULT_SORT: Record<TaskListScope, TaskListSort> = {
  workspace: 'number',
  project: 'status',
};

/** Направление при первом клике по колонке: новые/срочные — сверху, сроки и названия — по порядку. */
const DEFAULT_DIRECTION: Record<TaskListSort, SortDirection> = {
  number: 'desc',
  title: 'asc',
  priority: 'desc',
  due: 'asc',
  status: 'asc',
};

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PAGE_RE = /^[1-9]\d{0,5}$/;
/** `42`, `#42` или ключ задачи `TSK-42` (префикс не сверяется: поиск и так в пространстве). */
const TASK_NUMBER_QUERY_RE = /^(?:#|[a-z][a-z0-9]{1,9}-)?([1-9]\d{0,8})$/i;

export function defaultSortDirection(sort: TaskListSort): SortDirection {
  return DEFAULT_DIRECTION[sort];
}

function isSortAllowed(sort: TaskListSort, scope: TaskListScope): boolean {
  return sort !== 'status' || scope === 'project';
}

export function defaultTaskListQuery(scope: TaskListScope): TaskListQuery {
  const sort = DEFAULT_SORT[scope];
  return {
    q: '',
    statuses: [],
    categories: [],
    projects: [],
    priorities: [],
    assignees: [],
    due: null,
    topLevelOnly: false,
    sort,
    dir: DEFAULT_DIRECTION[sort],
    page: 1,
  };
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Список через запятую: trim, без пустых и повторов, только допустимые, не больше лимита. */
function parseList<T extends string>(
  value: string | string[] | undefined,
  isValid: (item: string) => item is T,
): T[] {
  const raw = first(value);
  if (!raw) return [];
  const items = new Set<T>();
  for (const part of raw.split(',')) {
    const item = part.trim();
    if (isValid(item)) items.add(item);
    if (items.size >= TASK_LIST_MAX_VALUES) break;
  }
  return [...items];
}

function oneOf<T extends string>(values: readonly T[]) {
  return (item: string): item is T => (values as readonly string[]).includes(item);
}

const isPriority = oneOf(TASK_PRIORITIES);
const isCategoryFilter = oneOf<TaskCategoryFilter>([...STATUS_CATEGORIES, TASK_LIST_NONE]);
const isDueFilter = oneOf(TASK_DUE_FILTERS);
const isSort = oneOf(TASK_LIST_SORTS);

function isEntityIdItem(item: string): item is string {
  return isEntityId(item);
}

function isProjectFilter(item: string): item is string {
  return item === TASK_LIST_NONE || isEntityId(item);
}

function isAssigneeFilter(item: string): item is string {
  return USER_ID_RE.test(item);
}

/** `searchParams` страницы → запрос списка. Параметры чужого scope игнорируются. */
export function parseTaskListParams(raw: RawParams, scope: TaskListScope): TaskListQuery {
  const query = defaultTaskListQuery(scope);

  query.q = (first(raw.q) ?? '').trim().replace(/\s+/g, ' ').slice(0, TASK_LIST_QUERY_MAX_LENGTH);
  if (scope === 'project') {
    query.statuses = parseList(raw.status, isEntityIdItem);
  } else {
    query.categories = parseList(raw.category, isCategoryFilter);
    query.projects = parseList(raw.project, isProjectFilter);
  }
  query.priorities = parseList(raw.priority, isPriority);
  query.assignees = parseList(raw.assignee, isAssigneeFilter);

  const due = first(raw.due);
  query.due = due && isDueFilter(due) ? due : null;
  query.topLevelOnly = first(raw.level) === TASK_LIST_LEVEL_TOP;

  const sort = first(raw.sort);
  if (sort && isSort(sort) && isSortAllowed(sort, scope)) query.sort = sort;
  const dir = first(raw.dir);
  query.dir = dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIRECTION[query.sort];

  const page = first(raw.page);
  query.page = page && PAGE_RE.test(page) ? Number(page) : 1;
  return query;
}

/** Запрос → query string (без `?`): стабильный порядок ключей, значения по умолчанию опущены. */
export function serializeTaskListParams(query: TaskListQuery, scope: TaskListScope): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (scope === 'workspace') {
    if (query.projects.length) params.set('project', query.projects.join(','));
    if (query.categories.length) params.set('category', query.categories.join(','));
  } else if (query.statuses.length) {
    params.set('status', query.statuses.join(','));
  }
  if (query.priorities.length) params.set('priority', query.priorities.join(','));
  if (query.assignees.length) params.set('assignee', query.assignees.join(','));
  if (query.due) params.set('due', query.due);
  if (query.topLevelOnly) params.set('level', TASK_LIST_LEVEL_TOP);
  if (query.sort !== DEFAULT_SORT[scope] && isSortAllowed(query.sort, scope)) {
    params.set('sort', query.sort);
  }
  if (query.dir !== DEFAULT_DIRECTION[query.sort]) params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

/** Изменение запроса; всё, кроме смены страницы, возвращает на первую страницу. */
export function patchTaskListQuery(
  query: TaskListQuery,
  patch: Partial<TaskListQuery>,
): TaskListQuery {
  const onlyPage = Object.keys(patch).every((key) => key === 'page');
  return { ...query, ...patch, page: onlyPage ? (patch.page ?? query.page) : 1 };
}

/** Клик по заголовку колонки: та же колонка — смена направления, другая — направление по умолчанию. */
export function toggleSort(query: TaskListQuery, sort: TaskListSort): TaskListQuery {
  const dir =
    query.sort === sort ? (query.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIRECTION[sort];
  return patchTaskListQuery(query, { sort, dir });
}

export function hasActiveFilters(query: TaskListQuery): boolean {
  return (
    query.q !== '' ||
    query.statuses.length > 0 ||
    query.categories.length > 0 ||
    query.projects.length > 0 ||
    query.priorities.length > 0 ||
    query.assignees.length > 0 ||
    query.due !== null ||
    query.topLevelOnly
  );
}

/** Сбрасывает фильтры и поиск, сохраняя сортировку. */
export function clearFilters(query: TaskListQuery, scope: TaskListScope): TaskListQuery {
  return { ...defaultTaskListQuery(scope), sort: query.sort, dir: query.dir };
}

/** Поиск `#42`, `42` или `TSK-42` → номер задачи, иначе null. */
export function parseTaskNumberQuery(q: string): number | null {
  const match = TASK_NUMBER_QUERY_RE.exec(q.trim());
  return match ? Number(match[1]) : null;
}

/** Границы срока для фильтра (даты `YYYY-MM-DD` включительно, `lt` — строго раньше). */
export type DueDateRange =
  { kind: 'none' } | { kind: 'range'; lt?: string; gte?: string; lte?: string };

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dueDateRange(filter: TaskDueFilter, today: string): DueDateRange {
  switch (filter) {
    case 'overdue':
      return { kind: 'range', lt: today };
    case 'today':
      return { kind: 'range', gte: today, lte: today };
    case 'week':
      return { kind: 'range', gte: today, lte: addDays(today, 6) };
    case 'none':
      return { kind: 'none' };
  }
}

/** Число страниц: минимум одна, даже если задач нет. */
export function pageCountOf(total: number, pageSize: number = TASK_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Номера строк текущей страницы для подписи «Показано 51–100 из 230»; при 0 задач — 0–0. */
export function pageBounds(
  page: number,
  total: number,
  pageSize: number = TASK_LIST_PAGE_SIZE,
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(page * pageSize, total) };
}

export type PaginationItem = number | 'ellipsis';

/**
 * Номера страниц для навигации: первая, последняя, текущая ±1; разрывы — многоточием.
 * Разрыв в одну страницу заполняется самой страницей: `1 2 3`, а не `1 … 3`.
 */
export function paginationRange(page: number, pageCount: number): PaginationItem[] {
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previous = 0;
  for (const value of pages) {
    if (value - previous === 2) items.push(previous + 1);
    else if (value - previous > 2) items.push('ellipsis');
    items.push(value);
    previous = value;
  }
  return items;
}
