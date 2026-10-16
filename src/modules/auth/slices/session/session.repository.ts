import 'server-only';

import { prisma } from '@/shared/db';

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  impersonatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SESSION_SELECT = {
  id: true,
  userAgent: true,
  ipAddress: true,
  impersonatedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Сессии читаются и удаляются напрямую: `listSessions` Better Auth требует «свежую» сессию
 * (моложе суток) и отдаёт токены. Токены отсюда не выходят. Удаление строки — то же, что делает
 * `revokeSession` (вторичного хранилища сессий в проекте нет).
 */
export const sessionRepository = {
  /** Действующие сессии пользователя. */
  listActive(userId: string, now: Date): Promise<SessionRow[]> {
    return prisma.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      select: SESSION_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  },

  /** Удаляет сессию, только если она принадлежит пользователю. Возвращает число удалённых. */
  async deleteOwned(userId: string, sessionId: string): Promise<number> {
    const { count } = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
    return count;
  },

  /** Удаляет все сессии пользователя, кроме указанной. */
  async deleteOthers(userId: string, keepSessionId: string): Promise<number> {
    const { count } = await prisma.session.deleteMany({
      where: { userId, id: { not: keepSessionId } },
    });
    return count;
  },
};
