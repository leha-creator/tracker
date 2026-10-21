import { encodeAuditCursor, parseAuditCursor, type AuditCursor } from './audit-cursor';

// Лента из двух источников: локальный журнал tasker и журнал IdP. У каждой стороны свой курсор;
// в адресе они идут через `~`: `<локальный>~<IdP>`, пустая часть — с начала, `-` — сторона
// закончилась. Курсор без `~` — старый формат, только локальная часть.

const SEPARATOR = '~';
const DONE = '-';

export type FeedPart<T> = T | null | 'done';

export interface FeedCursor {
  local: FeedPart<AuditCursor>;
  /** Курсор IdP как есть (`<ISO>_<id>`), проверенный по формату. */
  remote: FeedPart<string>;
}

export const FEED_START: FeedCursor = { local: null, remote: null };

function parseRemote(raw: string): FeedPart<string> {
  if (raw === '') return null;
  if (raw === DONE) return 'done';
  return parseAuditCursor(raw) ? raw : null;
}

/** Курсор ленты из адреса; некорректная часть — с начала. */
export function parseFeedCursor(raw: unknown): FeedCursor {
  if (typeof raw !== 'string' || raw === '') return FEED_START;
  const index = raw.indexOf(SEPARATOR);
  if (index < 0) return { local: parseAuditCursor(raw), remote: null };
  const localRaw = raw.slice(0, index);
  return {
    local: localRaw === DONE ? 'done' : parseAuditCursor(localRaw),
    remote: parseRemote(raw.slice(index + 1)),
  };
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  const local =
    cursor.local === 'done' ? DONE : cursor.local ? encodeAuditCursor(cursor.local) : '';
  const remote = cursor.remote === 'done' ? DONE : (cursor.remote ?? '');
  return `${local}${SEPARATOR}${remote}`;
}

interface FeedItem {
  id: string;
  createdAt: Date;
}

/** Новее — раньше; при равном времени — больший id (как orderBy createdAt desc, id desc). */
function isNewer(a: FeedItem, b: FeedItem): boolean {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  return diff !== 0 ? diff > 0 : a.id > b.id;
}

export interface MergeFeedInput<T extends FeedItem> {
  cursor: FeedCursor;
  pageSize: number;
  /** Локальные события после курсора, новые сверху. */
  local: T[];
  /** Локальных событий больше нет за пределами `local`. */
  localDone: boolean;
  /** События IdP после курсора, новые сверху. */
  remote: T[];
  /** Курсор IdP после последнего события `remote`; null — у IdP событий больше нет. */
  remoteNextCursor: string | null;
}

/**
 * Сливает две упорядоченные ленты в страницу. Событие с тем же id в обеих (история, перенесённая
 * в IdP) показывается один раз — из IdP. Страница обрывается, когда буфер одной стороны кончился,
 * а сама сторона — нет: иначе порядок нарушился бы на следующей странице.
 */
export function mergeAuditFeed<T extends FeedItem>(
  input: MergeFeedInput<T>,
): { items: T[]; nextCursor: FeedCursor | null } {
  const { local, remote, pageSize } = input;
  const remoteDone = input.remoteNextCursor === null;
  const items: T[] = [];
  let li = 0;
  let ri = 0;
  let lastLocal: T | undefined;
  let lastRemote: T | undefined;

  while (items.length < pageSize) {
    const l = local[li];
    const r = remote[ri];
    let takeLocal: boolean;
    if (l && r) {
      if (l.id === r.id) {
        lastLocal = l;
        li += 1;
        continue;
      }
      takeLocal = isNewer(l, r);
    } else if (r) {
      if (!input.localDone) break;
      takeLocal = false;
    } else if (l) {
      if (!remoteDone) break;
      takeLocal = true;
    } else {
      break;
    }
    if (takeLocal && l) {
      items.push(l);
      lastLocal = l;
      li += 1;
    } else if (r) {
      items.push(r);
      lastRemote = r;
      ri += 1;
    }
  }

  const localPart: FeedPart<AuditCursor> =
    li >= local.length && input.localDone
      ? 'done'
      : lastLocal
        ? { createdAt: lastLocal.createdAt, id: lastLocal.id }
        : input.cursor.local;
  const remotePart: FeedPart<string> =
    ri >= remote.length
      ? (input.remoteNextCursor ?? 'done')
      : lastRemote
        ? encodeAuditCursor(lastRemote)
        : input.cursor.remote;

  return {
    items,
    nextCursor:
      localPart === 'done' && remotePart === 'done'
        ? null
        : { local: localPart, remote: remotePart },
  };
}
