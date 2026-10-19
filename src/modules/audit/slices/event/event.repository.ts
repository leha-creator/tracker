import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import type { AuditCursor } from '../../models';

const auditEventSelect = {
  id: true,
  kind: true,
  category: true,
  data: true,
  ip: true,
  userAgent: true,
  createdAt: true,
  actorId: true,
  actorName: true,
  targetUserId: true,
  actor: { select: { id: true, name: true, image: true, isAgent: true } },
  impersonator: { select: { id: true, name: true } },
  targetUser: { select: { id: true, name: true } },
  viaToken: { select: { name: true } },
  workspace: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.AuditEventSelect;

export type AuditEventRow = Prisma.AuditEventGetPayload<{ select: typeof auditEventSelect }>;
export type AuditEventWhere = Prisma.AuditEventWhereInput;

/** Строк удаляется за один запрос очистки: не держим долгую блокировку таблицы. */
export const AUDIT_PURGE_BATCH_SIZE = 5000;

function afterCursor(cursor: AuditCursor | null): AuditEventWhere {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export const auditEventRepository = {
  /** Страница событий: новые сверху, `take` с запасом в одну строку для признака продолжения. */
  list(where: AuditEventWhere, cursor: AuditCursor | null, take: number) {
    return prisma.auditEvent.findMany({
      where: { AND: [where, afterCursor(cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: auditEventSelect,
    });
  },

  /** Удаляет пачку событий старше `before`. Возвращает число удалённых строк. */
  async purgeBatch(before: Date): Promise<number> {
    return prisma.$executeRaw`
      DELETE FROM "AuditEvent"
      WHERE "id" IN (
        SELECT "id" FROM "AuditEvent" WHERE "createdAt" < ${before} LIMIT ${AUDIT_PURGE_BATCH_SIZE}
      )`;
  },
};
