import {
  AUDIT_CATEGORIES,
  isAuditEventKind,
  type AuditCategory,
  type AuditEventKind,
} from '@/shared/audit/client';

import { FEED_START, parseFeedCursor, type FeedCursor } from './audit-feed';

/** Событий на странице: лента участника, свой журнал, журнал администратора. */
export const MEMBER_ACTIVITY_PAGE_SIZE = 20;
export const MY_SECURITY_EVENTS_PAGE_SIZE = 30;
export const ADMIN_AUDIT_PAGE_SIZE = 50;

/** Предел длины id в фильтрах (id Better Auth — не UUID). */
const ID_MAX_LENGTH = 64;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  security: 'Безопасность',
  workspace: 'Пространства',
  content: 'Задачи и документы',
  admin: 'Администрирование',
};

/** Фильтры общего журнала администратора (состояние — в URL). */
export interface AdminAuditQuery {
  /** Автор, субъект или администратор под имперсонацией. */
  userId: string | null;
  category: AuditCategory | null;
  kind: AuditEventKind | null;
  workspaceId: string | null;
  /** Дата начала периода `YYYY-MM-DD` (включительно, UTC). */
  from: string | null;
  /** Дата конца периода `YYYY-MM-DD` (включительно, UTC). */
  to: string | null;
  /** Курсор ленты: локальная часть и часть IdP (при фильтре по пользователю). */
  cursor: FeedCursor;
}

export const EMPTY_ADMIN_AUDIT_QUERY: AdminAuditQuery = {
  userId: null,
  category: null,
  kind: null,
  workspaceId: null,
  from: null,
  to: null,
  cursor: FEED_START,
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function id(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= ID_MAX_LENGTH ? trimmed : null;
}

function date(value: string | undefined): string | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) ? null : value;
}

/** Разбирает параметры адреса; некорректные значения отбрасываются. */
export function parseAdminAuditParams(params: SearchParams): AdminAuditQuery {
  const category = first(params.category);
  const kind = first(params.kind);
  return {
    userId: id(first(params.user)),
    category: AUDIT_CATEGORIES.find((value) => value === category) ?? null,
    kind: kind && isAuditEventKind(kind) ? kind : null,
    workspaceId: id(first(params.workspace)),
    from: date(first(params.from)),
    to: date(first(params.to)),
    cursor: parseFeedCursor(first(params.cursor)),
  };
}

/** Параметры адреса для фильтров (курсор не сохраняется — фильтр начинает с первой страницы). */
export function serializeAdminAuditParams(query: Omit<AdminAuditQuery, 'cursor'>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.userId) params.set('user', query.userId);
  if (query.category) params.set('category', query.category);
  if (query.kind) params.set('kind', query.kind);
  if (query.workspaceId) params.set('workspace', query.workspaceId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return params;
}

export function hasActiveAuditFilters(query: AdminAuditQuery): boolean {
  return Boolean(
    query.userId || query.category || query.kind || query.workspaceId || query.from || query.to,
  );
}

/** Границы периода: `to` включительно — до начала следующего дня. */
export function auditPeriodBounds(query: Pick<AdminAuditQuery, 'from' | 'to'>): {
  gte: Date | null;
  lt: Date | null;
} {
  const gte = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
  let lt: Date | null = null;
  if (query.to) {
    lt = new Date(`${query.to}T00:00:00.000Z`);
    lt.setUTCDate(lt.getUTCDate() + 1);
  }
  return { gte, lt };
}
