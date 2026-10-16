import 'server-only';

import { prisma } from '@/shared/db';

const tokenSelect = {
  id: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  workspace: { select: { id: true, slug: true, name: true } },
} as const;

export type ApiTokenRow = Awaited<ReturnType<typeof apiTokenRepository.listForUser>>[number];

export const apiTokenRepository = {
  /** Действующие токены пользователя (не отозваны и не истекли) — для лимита. */
  countActive(userId: string, now: Date): Promise<number> {
    return prisma.apiToken.count({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  },

  create(data: {
    userId: string;
    workspaceId: string;
    name: string;
    prefix: string;
    tokenHash: string;
    expiresAt: Date | null;
  }) {
    return prisma.apiToken.create({ data, select: tokenSelect });
  },

  listForUser(userId: string) {
    return prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: tokenSelect,
    });
  },

  findOwned(userId: string, tokenId: string) {
    return prisma.apiToken.findFirst({
      where: { id: tokenId, userId },
      select: { id: true, workspaceId: true, revokedAt: true },
    });
  },

  async revoke(tokenId: string, now: Date): Promise<boolean> {
    const { count } = await prisma.apiToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count > 0;
  },

  /** Токен по хешу для аутентификации: с пользователем и пространством. */
  findByHash(tokenHash: string) {
    return prisma.apiToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        prefix: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            banned: true,
            banExpires: true,
          },
        },
        workspace: { select: { id: true, slug: true, name: true, taskKey: true } },
      },
    });
  },

  /** `lastUsedAt = now`, если прошлое обновление старше `before` (не пишем на каждый запрос). */
  async touch(tokenId: string, now: Date, before: Date): Promise<void> {
    await prisma.apiToken.updateMany({
      where: { id: tokenId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: before } }] },
      data: { lastUsedAt: now },
    });
  },
};
