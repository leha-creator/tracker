import 'server-only';

import { describeUserAgent } from '@/modules/auth/client';
import { requireAdmin, requireUser, requireWorkspaceAccess } from '@/shared/access';
import {
  AUDIT_CATEGORIES,
  AUDIT_EVENT_OWNERS,
  type AuditCategory,
  type AuditEventKind,
} from '@/shared/audit/client';
import type { AuthSession } from '@/shared/auth';
import {
  findIdpSubject,
  findUsersByIdpSubjects,
  listIdpAdminUserEvents,
  listIdpUserEvents,
  type IdpAuditEvent,
  type IdpAuditPage,
} from '@/shared/idp';
import { createLogger } from '@/shared/logger';

import {
  ADMIN_AUDIT_PAGE_SIZE,
  auditPeriodBounds,
  describeAuditEvent,
  encodeAuditCursor,
  encodeFeedCursor,
  FEED_START,
  MEMBER_ACTIVITY_PAGE_SIZE,
  mergeAuditFeed,
  MY_SECURITY_EVENTS_PAGE_SIZE,
  type AdminAuditQuery,
  type AuditCursor,
  type AuditPerspective,
  type FeedCursor,
  type FeedPart,
} from '../../models';
import type { AuditEventDto, AuditEventPageDto } from './event.dto';
import {
  AUDIT_PURGE_BATCH_SIZE,
  auditEventRepository,
  type AuditEventRow,
  type AuditEventWhere,
} from './event.repository';

const log = createLogger('audit');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сколько страниц IdP подряд читать, пока фильтр не оставит хотя бы одно событие. */
const REMOTE_MAX_PAGES = 5;

/** Типы, которые пишет IdP: в слитых лентах они берутся только оттуда. */
const IDENTITY_KINDS = (Object.keys(AUDIT_EVENT_OWNERS) as AuditEventKind[]).filter(
  (kind) => AUDIT_EVENT_OWNERS[kind] === 'identity',
);
const APP_KINDS_ONLY: AuditEventWhere = { kind: { notIn: IDENTITY_KINDS } };

function toDto(row: AuditEventRow, perspective: AuditPerspective): AuditEventDto {
  const description = describeAuditEvent(row.kind, row.data, {
    workspaceSlug: row.workspace?.slug ?? null,
    targetUserId: row.targetUserId,
    perspective,
  });
  // Удалённый автор — по снимку имени; без автора и снимка — система.
  const actorName = row.actor?.name ?? row.actorName;
  const showRequest = perspective !== 'member';
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    text: description.text,
    details: description.details,
    href: description.href,
    actor: actorName
      ? {
          id: row.actor?.id ?? null,
          name: actorName,
          image: row.actor?.image ?? null,
          isAgent: row.actor?.isAgent ?? false,
        }
      : null,
    impersonator: row.impersonator,
    viaTokenName: row.viaToken?.name ?? null,
    workspace: row.workspace,
    ip: showRequest ? row.ip : null,
    device: showRequest && row.userAgent ? describeUserAgent(row.userAgent).label : null,
    createdAt: row.createdAt,
  };
}

function isAuditCategory(value: string): value is AuditCategory {
  return (AUDIT_CATEGORIES as readonly string[]).includes(value);
}

/** Событие IdP в формате ленты: текст готов в IdP, автор — пользователь tasker по `sub`. */
async function remoteToDtos(
  events: IdpAuditEvent[],
  perspective: AuditPerspective,
): Promise<AuditEventDto[]> {
  const subjects = events.flatMap((event) => [event.actor?.id, event.impersonatorId]);
  const users = await findUsersByIdpSubjects(
    subjects.filter((sub): sub is string => typeof sub === 'string'),
  );
  return events.map((event): AuditEventDto => {
    const actorUser = event.actor?.id ? users.get(event.actor.id) : undefined;
    const impersonator = event.impersonatorId ? users.get(event.impersonatorId) : undefined;
    return {
      id: event.id,
      kind: event.kind,
      category: isAuditCategory(event.category) ? event.category : 'security',
      text: event.text,
      details: perspective === 'admin' ? event.details : null,
      href: null,
      actor: event.actor
        ? {
            id: actorUser?.id ?? null,
            name: actorUser?.name ?? event.actor.name,
            image: actorUser?.image ?? null,
            isAgent: false,
          }
        : null,
      impersonator: impersonator ? { id: impersonator.id, name: impersonator.name } : null,
      viaTokenName: null,
      workspace: null,
      ip: event.ip,
      device: event.device,
      createdAt: event.createdAt,
    };
  });
}

async function loadLocal(
  where: AuditEventWhere,
  cursor: FeedPart<AuditCursor>,
  pageSize: number,
  perspective: AuditPerspective,
): Promise<{ items: AuditEventDto[]; done: boolean }> {
  if (cursor === 'done') return { items: [], done: true };
  const rows = await auditEventRepository.list(where, cursor, pageSize + 1);
  return { items: rows.map((row) => toDto(row, perspective)), done: rows.length <= pageSize };
}

interface RemoteFeed {
  items: AuditEventDto[];
  nextCursor: string | null;
  unavailable: boolean;
}

/**
 * События IdP после курсора. Фильтр применяется здесь (у IdP фильтров нет): если страница
 * отфильтровалась целиком, читается следующая. IdP недоступен — пусто и признак `unavailable`.
 */
async function loadRemote(
  source: (cursor: string | null) => Promise<IdpAuditPage>,
  cursor: FeedPart<string>,
  perspective: AuditPerspective,
  filter: (event: IdpAuditEvent) => boolean = () => true,
): Promise<RemoteFeed> {
  if (cursor === 'done') return { items: [], nextCursor: null, unavailable: false };
  const events: IdpAuditEvent[] = [];
  let next: string | null = cursor;
  try {
    for (let page = 0; page < REMOTE_MAX_PAGES; page += 1) {
      const result = await source(next);
      events.push(...result.events.filter(filter));
      next = result.nextCursor;
      if (events.length > 0 || !next) break;
    }
  } catch (error) {
    log.warn(
      { reason: error instanceof Error ? error.message : String(error) },
      '[audit.identity] IdP journal unavailable, feed shown without account events',
    );
    return { items: [], nextCursor: null, unavailable: true };
  }
  return { items: await remoteToDtos(events, perspective), nextCursor: next, unavailable: false };
}

async function loadMergedPage(input: {
  cursor: FeedCursor;
  pageSize: number;
  perspective: AuditPerspective;
  localWhere: AuditEventWhere;
  /** null — у пользователя нет связи с IdP, лента только локальная. */
  remote: ((cursor: string | null) => Promise<IdpAuditPage>) | null;
  remoteFilter?: (event: IdpAuditEvent) => boolean;
}): Promise<AuditEventPageDto> {
  const [local, remote] = await Promise.all([
    loadLocal(input.localWhere, input.cursor.local, input.pageSize, input.perspective),
    input.remote
      ? loadRemote(input.remote, input.cursor.remote, input.perspective, input.remoteFilter)
      : Promise.resolve<RemoteFeed>({ items: [], nextCursor: null, unavailable: false }),
  ]);
  const merged = mergeAuditFeed({
    cursor: input.cursor,
    pageSize: input.pageSize,
    local: local.items,
    localDone: local.done,
    remote: remote.items,
    remoteNextCursor: remote.nextCursor,
  });
  log.debug(
    {
      local: local.items.length,
      remote: remote.items.length,
      shown: merged.items.length,
      identityUnavailable: remote.unavailable,
    },
    '[audit.feed] merged',
  );
  return {
    items: merged.items,
    nextCursor: merged.nextCursor ? encodeFeedCursor(merged.nextCursor) : null,
    ...(remote.unavailable && { identityUnavailable: true }),
  };
}

/**
 * Последние действия участника в пространстве — для профиля участника. Видит любой участник
 * пространства; только события пространства и содержимого, без IP и устройств.
 */
export async function listMemberWorkspaceActivity(
  session: AuthSession,
  workspaceId: string,
  userId: string,
  cursor: AuditCursor | null = null,
): Promise<AuditEventPageDto> {
  await requireWorkspaceAccess(session, workspaceId);
  const local = await loadLocal(
    { workspaceId, actorId: userId, category: { in: ['workspace', 'content'] } },
    cursor,
    MEMBER_ACTIVITY_PAGE_SIZE,
    'member',
  );
  const items = local.items.slice(0, MEMBER_ACTIVITY_PAGE_SIZE);
  const last = items.at(-1);
  const page: AuditEventPageDto = {
    items,
    nextCursor: !local.done && last ? encodeAuditCursor(last) : null,
  };
  log.debug(
    { viewerId: session.user.id, workspaceId, userId, count: page.items.length },
    '[audit.memberActivity]',
  );
  return page;
}

/**
 * Свой журнал безопасности: события учётной записи из IdP (входы, пароль, 2FA, сессии IdP) и
 * свои события tasker (сеансы Tasker, GitHub, токены).
 */
export async function listMySecurityEvents(
  cursor: FeedCursor = FEED_START,
): Promise<AuditEventPageDto> {
  const session = await requireUser();
  const userId = session.user.id;
  const sub = await findIdpSubject(userId);
  const page = await loadMergedPage({
    cursor,
    pageSize: MY_SECURITY_EVENTS_PAGE_SIZE,
    perspective: 'self',
    localWhere: {
      AND: [
        APP_KINDS_ONLY,
        { category: 'security', OR: [{ actorId: userId }, { targetUserId: userId }] },
      ],
    },
    remote: sub ? (next) => listIdpUserEvents(sub, next) : null,
  });
  log.debug({ userId, linked: sub !== null, count: page.items.length }, '[audit.mySecurity]');
  return page;
}

function adminWhere(query: AdminAuditQuery): AuditEventWhere {
  const { gte, lt } = auditPeriodBounds(query);
  const where: AuditEventWhere[] = [];
  if (query.userId) {
    where.push({
      OR: [
        { actorId: query.userId },
        { targetUserId: query.userId },
        { impersonatorId: query.userId },
      ],
    });
  }
  if (query.category) where.push({ category: query.category });
  if (query.kind) where.push({ kind: query.kind });
  if (query.workspaceId) where.push({ workspaceId: query.workspaceId });
  if (gte || lt) where.push({ createdAt: { ...(gte && { gte }), ...(lt && { lt }) } });
  return { AND: where };
}

/** Фильтры журнала администратора для событий IdP (у API IdP своих фильтров нет). */
function remoteAdminFilter(query: AdminAuditQuery): (event: IdpAuditEvent) => boolean {
  const { gte, lt } = auditPeriodBounds(query);
  return (event) =>
    (!query.category || event.category === query.category) &&
    (!query.kind || event.kind === query.kind) &&
    (!gte || event.createdAt >= gte) &&
    (!lt || event.createdAt < lt);
}

/**
 * Журнал ресурса для администратора. С фильтром по пользователю (и без фильтра по пространству)
 * к локальным событиям добавляются события его учётной записи из IdP; общей ленты у IdP нет.
 */
export async function listAdminAuditEvents(query: AdminAuditQuery): Promise<AuditEventPageDto> {
  const session = await requireAdmin();
  const withIdentity = query.userId !== null && query.workspaceId === null;
  let remote: ((cursor: string | null) => Promise<IdpAuditPage>) | null = null;
  let identityUnavailable = false;
  if (withIdentity && query.userId) {
    const [sub, actor] = await Promise.all([
      findIdpSubject(query.userId),
      findIdpSubject(session.user.id),
    ]);
    if (sub && actor) remote = (next) => listIdpAdminUserEvents(sub, actor, next);
    // Администратор без связи с IdP (не входил через plwedding ID) журнал IdP не читает.
    else if (sub) identityUnavailable = true;
  }
  const page = await loadMergedPage({
    cursor: withIdentity ? query.cursor : { local: query.cursor.local, remote: 'done' },
    pageSize: ADMIN_AUDIT_PAGE_SIZE,
    perspective: 'admin',
    localWhere: withIdentity ? { AND: [APP_KINDS_ONLY, adminWhere(query)] } : adminWhere(query),
    remote,
    remoteFilter: remoteAdminFilter(query),
  });
  log.debug(
    {
      actorId: session.user.id,
      userId: query.userId,
      category: query.category,
      kind: query.kind,
      workspaceId: query.workspaceId,
      withIdentity: remote !== null,
      count: page.items.length,
    },
    '[audit.adminList]',
  );
  return identityUnavailable ? { ...page, identityUnavailable: true } : page;
}

/**
 * Удаляет события старше срока хранения. Системная функция без сессии — только для
 * `/api/cron/cleanup` (доверие секрету планировщика). Удаляет пачками до конца.
 */
export async function purgeExpiredAuditEvents(input: {
  now: Date;
  retentionDays: number;
}): Promise<{ deleted: number; cutoff: Date }> {
  const cutoff = new Date(input.now.getTime() - input.retentionDays * DAY_MS);
  let deleted = 0;
  for (;;) {
    const batch = await auditEventRepository.purgeBatch(cutoff);
    deleted += batch;
    if (batch < AUDIT_PURGE_BATCH_SIZE) break;
  }
  log.info({ deleted, cutoff, retentionDays: input.retentionDays }, '[audit.purge]');
  return { deleted, cutoff };
}
