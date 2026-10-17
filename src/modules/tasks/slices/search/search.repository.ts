import 'server-only';

import { prisma } from '@/shared/db';

const SEARCH_RESULT_SELECT = {
  id: true,
  number: true,
  title: true,
  workspace: { select: { taskKey: true } },
  placements: {
    orderBy: { createdAt: 'asc' as const },
    take: 1,
    select: {
      status: { select: { name: true, category: true } },
      project: { select: { name: true } },
    },
  },
  _count: { select: { placements: true } },
} as const;

// Поиск задач. where всегда с workspaceId и без архивных задач.
export const searchRepository = {
  findByNumber(workspaceId: string, number: number) {
    return prisma.task.findFirst({
      where: { workspaceId, number, archivedAt: null },
      select: SEARCH_RESULT_SELECT,
    });
  },

  /** Часть названия без учёта регистра (GIN-индекс pg_trgm), новые выше. */
  findByTitle(workspaceId: string, text: string, take: number, excludeId?: string) {
    return prisma.task.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        title: { contains: text, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      orderBy: { number: 'desc' },
      take,
      select: SEARCH_RESULT_SELECT,
    });
  },
};

export type TaskSearchRow = NonNullable<Awaited<ReturnType<typeof searchRepository.findByNumber>>>;
