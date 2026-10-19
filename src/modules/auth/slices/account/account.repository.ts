import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

/** Агенты пространств — служебные пользователи: в метриках учётных записей их нет. */
const people = { isAgent: false } as const;

function bannedNow(now: Date): Prisma.UserWhereInput {
  return { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: now } }] };
}

export const accountRepository = {
  listActiveSessions(userId: string, now: Date) {
    return prisma.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        impersonatedBy: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
  },

  /** Удаляет сессию, только если она принадлежит пользователю (защита от IDOR). */
  async deleteSession(userId: string, sessionId: string): Promise<number> {
    const { count } = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
    return count;
  },

  async markEmailVerified(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
  },

  /** Сброс 2FA: секрет и резервные коды удаляются, флаг снимается — атомарно. */
  async resetTwoFactor(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.twoFactor.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
    ]);
  },

  async userCounts(now: Date): Promise<{
    total: number;
    admins: number;
    banned: number;
    unverified: number;
    twoFactor: number;
  }> {
    const [total, admins, banned, unverified, twoFactor] = await prisma.$transaction([
      prisma.user.count({ where: people }),
      prisma.user.count({ where: { ...people, role: 'admin' } }),
      prisma.user.count({ where: { AND: [people, bannedNow(now)] } }),
      prisma.user.count({ where: { ...people, emailVerified: false } }),
      prisma.user.count({ where: { ...people, twoFactorEnabled: true } }),
    ]);
    return { total, admins, banned, unverified, twoFactor };
  },

  /** Действующие сессии людей; входы «от имени» — отдельно. */
  async sessionCounts(now: Date): Promise<{ active: number; impersonated: number }> {
    const where = { expiresAt: { gt: now }, user: people };
    const [active, impersonated] = await prisma.$transaction([
      prisma.session.count({ where }),
      prisma.session.count({ where: { ...where, impersonatedBy: { not: null } } }),
    ]);
    return { active, impersonated };
  },

  /** Регистрации по дням с момента `since`. createdAt — timestamp без зоны, хранится в UTC. */
  signupsByDay(since: Date): Promise<{ day: string; count: number }[]> {
    return prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= ${since} AND "isAgent" = false
      GROUP BY 1
      ORDER BY 1`;
  },

  /**
   * Неудачные входы с момента `since` — из журнала (AuditEvent). Таблицу модуля audit читаем
   * своим запросом, как notifications читает User: обратной зависимости нет.
   */
  countFailedSignIns(since: Date): Promise<number> {
    return prisma.auditEvent.count({
      where: { kind: 'auth.sign_in_failed', createdAt: { gte: since } },
    });
  },
};
