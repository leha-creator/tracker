import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import { DOCUMENT_SUMMARY_SELECT, VISIBLE_DOCUMENT_WHERE } from '../document/document.select';

// Read-модели раздела «Документы». where всегда содержит workspaceId (см. documents-list.prisma.ts).
export const viewsRepository = {
  /** Страница документов и общее число по условию — согласованно, одной транзакцией. */
  async listDocumentPage(args: {
    where: Prisma.DocumentWhereInput;
    orderBy: Prisma.DocumentOrderByWithRelationInput[];
    skip: number;
    take: number;
  }) {
    const [rows, total] = await prisma.$transaction([
      prisma.document.findMany({ ...args, select: DOCUMENT_SUMMARY_SELECT }),
      prisma.document.count({ where: args.where }),
    ]);
    return { rows, total };
  },

  listRecent(workspaceId: string, take: number) {
    return prisma.document.findMany({
      where: { workspaceId, ...VISIBLE_DOCUMENT_WHERE },
      orderBy: { updatedAt: 'desc' },
      take,
      select: DOCUMENT_SUMMARY_SELECT,
    });
  },

  /** Часть названия (titleKey в нижнем регистре, GIN-индекс pg_trgm), недавно изменённые выше. */
  searchByTitle(workspaceId: string, textKey: string, take: number) {
    return prisma.document.findMany({
      where: { workspaceId, ...VISIBLE_DOCUMENT_WHERE, titleKey: { contains: textKey } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take,
      select: DOCUMENT_SUMMARY_SELECT,
    });
  },
};
