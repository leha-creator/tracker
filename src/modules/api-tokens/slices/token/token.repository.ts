import 'server-only';

import { prisma } from '@/shared/db';

const tokenSelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  workspace: { select: { id: true, slug: true, name: true } },
} as const;

export type ApiTokenRow = Awaited<ReturnType<typeof apiTokenRepository.listForUser>>[number];

/**
 * Таблица модуля — ApiToken. Строку агента (WorkspaceAgent, модуль agents) модуль только читает:
 * пространство агента, отключён ли он, ответственный (задокументированное чтение чужой таблицы —
 * agents сам зависит от api-tokens).
 */
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
    issuedById: string;
    name: string;
    prefix: string;
    tokenHash: string;
    scopes: string[];
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

  /** Агент пространства: для выпуска и отзыва его токенов владельцем. */
  findAgent(agentId: string) {
    return prisma.workspaceAgent.findUnique({
      where: { userId: agentId },
      select: { userId: true, workspaceId: true, disabledAt: true },
    });
  },

  async revoke(tokenId: string, now: Date): Promise<boolean> {
    const { count } = await prisma.apiToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count > 0;
  },

  /** Отзывает все действующие токены пользователя. Возвращает число отозванных. */
  async revokeAllForUser(userId: string, now: Date): Promise<number> {
    const { count } = await prisma.apiToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  },

  /** Токен по хешу для аутентификации: с пользователем, агентом и пространством. */
  findByHash(tokenHash: string) {
    return prisma.apiToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
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
            isAgent: true,
            agent: {
              select: {
                workspaceId: true,
                disabledAt: true,
                responsibleUserId: true,
                responsible: { select: { name: true } },
              },
            },
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
