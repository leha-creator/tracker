import { isDocumentEntityId } from './document';
import { extensionsOfKinds, type DocumentFileKind } from './document-type';

/**
 * Запрос обзора документов: папка, поиск, фильтры, сортировка и страница. Живёт в URL
 * (`searchParams`), поэтому разбор нестрогий — некорректные значения отбрасываются.
 */

export const DOCUMENT_LIST_PAGE_SIZE = 50;
export const DOCUMENT_LIST_QUERY_MAX_LENGTH = 100;

export const DOCUMENT_LIST_SORTS = ['name', 'updated', 'created'] as const;
export type DocumentListSort = (typeof DOCUMENT_LIST_SORTS)[number];
export type DocumentSortDirection = 'asc' | 'desc';

export const DOCUMENT_LIST_SORT_LABELS: Record<DocumentListSort, string> = {
  name: 'Название',
  updated: 'Изменён',
  created: 'Создан',
};

export const DOCUMENT_KIND_FILTERS = ['note', 'image', 'pdf', 'text', 'media', 'other'] as const;
export type DocumentKindFilter = (typeof DOCUMENT_KIND_FILTERS)[number];

export const DOCUMENT_KIND_FILTER_LABELS: Record<DocumentKindFilter, string> = {
  note: 'Заметки',
  image: 'Изображения',
  pdf: 'PDF',
  text: 'Текст и код',
  media: 'Аудио и видео',
  other: 'Прочие файлы',
};

const KIND_FILTER_KINDS: Record<
  Exclude<DocumentKindFilter, 'note' | 'other'>,
  DocumentFileKind[]
> = {
  image: ['image'],
  pdf: ['pdf'],
  text: ['text'],
  media: ['audio', 'video'],
};

const DEFAULT_DIRECTION: Record<DocumentListSort, DocumentSortDirection> = {
  name: 'asc',
  updated: 'desc',
  created: 'desc',
};

export interface DocumentListQuery {
  /** Текущая папка; null — корень пространства. */
  folder: string | null;
  /** Поиск по названию; пустая строка — без поиска. */
  q: string;
  /** id тега. */
  tag: string | null;
  kind: DocumentKindFilter | null;
  sort: DocumentListSort;
  dir: DocumentSortDirection;
  /** Номер страницы с 1. */
  page: number;
}

/** Условие фильтра по виду: заметки или файлы с расширениями из списка (или вне его). */
export type DocumentKindCondition =
  { kind: 'note' } | { kind: 'file'; extensions: string[]; exclude: boolean };

const PAGE_RE = /^[1-9]\d{0,5}$/;

export function defaultDocumentListQuery(): DocumentListQuery {
  return { folder: null, q: '', tag: null, kind: null, sort: 'name', dir: 'asc', page: 1 };
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | null {
  return value !== undefined && (values as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseDocumentListParams(raw: RawParams): DocumentListQuery {
  const query = defaultDocumentListQuery();

  const folder = first(raw.folder);
  query.folder = folder && isDocumentEntityId(folder) ? folder : null;
  query.q = (first(raw.q) ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, DOCUMENT_LIST_QUERY_MAX_LENGTH);
  const tag = first(raw.tag);
  query.tag = tag && isDocumentEntityId(tag) ? tag : null;
  query.kind = oneOf(DOCUMENT_KIND_FILTERS, first(raw.kind));

  query.sort = oneOf(DOCUMENT_LIST_SORTS, first(raw.sort)) ?? 'name';
  query.dir = oneOf(['asc', 'desc'] as const, first(raw.dir)) ?? DEFAULT_DIRECTION[query.sort];

  const page = first(raw.page);
  query.page = page && PAGE_RE.test(page) ? Number(page) : 1;
  return query;
}

/** Запрос → query string (без `?`): стабильный порядок ключей, значения по умолчанию опущены. */
export function serializeDocumentListParams(query: DocumentListQuery): string {
  const params = new URLSearchParams();
  if (query.folder) params.set('folder', query.folder);
  if (query.q) params.set('q', query.q);
  if (query.tag) params.set('tag', query.tag);
  if (query.kind) params.set('kind', query.kind);
  if (query.sort !== 'name') params.set('sort', query.sort);
  if (query.dir !== DEFAULT_DIRECTION[query.sort]) params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

/** Изменение запроса; всё, кроме смены страницы, возвращает на первую страницу. */
export function patchDocumentListQuery(
  query: DocumentListQuery,
  patch: Partial<DocumentListQuery>,
): DocumentListQuery {
  const onlyPage = Object.keys(patch).every((key) => key === 'page');
  const next = { ...query, ...patch, page: onlyPage ? (patch.page ?? query.page) : 1 };
  if (patch.sort && !patch.dir) next.dir = DEFAULT_DIRECTION[patch.sort];
  return next;
}

/**
 * Поиск по всему пространству (а не обзор одной папки): задан поиск, тег или вид.
 * В этом режиме подпапки не показываются, у документов видна их папка.
 */
export function isDocumentSearch(query: DocumentListQuery): boolean {
  return query.q !== '' || query.tag !== null || query.kind !== null;
}

/** Сбрасывает поиск и фильтры, оставаясь в текущей папке. */
export function clearDocumentFilters(query: DocumentListQuery): DocumentListQuery {
  return { ...defaultDocumentListQuery(), folder: query.folder, sort: query.sort, dir: query.dir };
}

export function documentKindCondition(filter: DocumentKindFilter): DocumentKindCondition {
  if (filter === 'note') return { kind: 'note' };
  if (filter === 'other') {
    return {
      kind: 'file',
      extensions: extensionsOfKinds(Object.values(KIND_FILTER_KINDS).flat()),
      exclude: true,
    };
  }
  return { kind: 'file', extensions: extensionsOfKinds(KIND_FILTER_KINDS[filter]), exclude: false };
}

/** Число страниц: минимум одна. */
export function documentPageCount(total: number, pageSize = DOCUMENT_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
