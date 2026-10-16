import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import type { ActivityCursor } from './activity.schema';

const ACTIVITY_SELECT = {
  id: true,
  tool: true,
  summary: true,
  targetKey: true,
  createdAt: true,
  token: { select: { name: true } },
} as const satisfies Prisma.McpActivitySelect;

export type McpActivityRow = Prisma.McpActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>;

/** Записи после курсора: новые → старые, при равном времени — по id. */
function afterCursor(cursor: ActivityCursor | null): Prisma.McpActivityWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export const activityRepository = {
  async create(data: {
    workspaceId: string;
    userId: string;
    tokenId: string | null;
    tool: string;
    summary: string;
    targetKey: string | null;
  }): Promise<void> {
    await prisma.mcpActivity.create({ data, select: { id: true } });
  },

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await prisma.mcpActivity.deleteMany({ where: { createdAt: { lt: before } } });
    return count;
  },

  /** Журнал пользователя (агента) в пространстве — все его токены. */
  listForUser(workspaceId: string, userId: string, cursor: ActivityCursor | null, take: number) {
    return prisma.mcpActivity.findMany({
      where: { workspaceId, userId, ...afterCursor(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: ACTIVITY_SELECT,
    });
  },

  listForToken(tokenId: string, cursor: ActivityCursor | null, take: number) {
    return prisma.mcpActivity.findMany({
      where: { tokenId, ...afterCursor(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: ACTIVITY_SELECT,
    });
  },

  /** Токен с владельцем и пространством — для проверки прав чтения журнала. */
  findToken(tokenId: string) {
    return prisma.apiToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        name: true,
        userId: true,
        issuedById: true,
        workspace: { select: { id: true, slug: true, name: true } },
      },
    });
  },
};
