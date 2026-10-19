import 'server-only';

import { describeUserAgent } from '@/modules/auth/client';
import { requireAdmin, requireUser, requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

import {
  ADMIN_AUDIT_PAGE_SIZE,
  auditPeriodBounds,
  describeAuditEvent,
  encodeAuditCursor,
  MEMBER_ACTIVITY_PAGE_SIZE,
  MY_SECURITY_EVENTS_PAGE_SIZE,
  type AdminAuditQuery,
  type AuditCursor,
  type AuditPerspective,
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

async function loadPage(
  where: AuditEventWhere,
  cursor: AuditCursor | null,
  pageSize: number,
  perspective: AuditPerspective,
): Promise<AuditEventPageDto> {
  const rows = await auditEventRepository.list(where, cursor, pageSize + 1);
  const items = rows.slice(0, pageSize).map((row) => toDto(row, perspective));
  const last = rows[pageSize - 1];
  return {
    items,
    nextCursor: rows.length > pageSize && last ? encodeAuditCursor(last) : null,
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
  const page = await loadPage(
    { workspaceId, actorId: userId, category: { in: ['workspace', 'content'] } },
    cursor,
    MEMBER_ACTIVITY_PAGE_SIZE,
    'member',
  );
  log.debug(
    { viewerId: session.user.id, workspaceId, userId, count: page.items.length },
    '[audit.memberActivity]',
  );
  return page;
}

/** Свой журнал безопасности: входы, неудачные попытки, пароль, 2FA, сессии, токены. */
export async function listMySecurityEvents(
  cursor: AuditCursor | null = null,
): Promise<AuditEventPageDto> {
  const session = await requireUser();
  const userId = session.user.id;
  const page = await loadPage(
    { category: 'security', OR: [{ actorId: userId }, { targetUserId: userId }] },
    cursor,
    MY_SECURITY_EVENTS_PAGE_SIZE,
    'self',
  );
  log.debug({ userId, count: page.items.length }, '[audit.mySecurity]');
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

/** Общий журнал ресурса для администратора. */
export async function listAdminAuditEvents(query: AdminAuditQuery): Promise<AuditEventPageDto> {
  const session = await requireAdmin();
  const page = await loadPage(adminWhere(query), query.cursor, ADMIN_AUDIT_PAGE_SIZE, 'admin');
  log.debug(
    {
      actorId: session.user.id,
      userId: query.userId,
      category: query.category,
      kind: query.kind,
      workspaceId: query.workspaceId,
      count: page.items.length,
    },
    '[audit.adminList]',
  );
  return page;
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
