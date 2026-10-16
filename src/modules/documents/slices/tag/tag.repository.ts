import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import { VISIBLE_DOCUMENT_WHERE } from '../document/document.select';

const TAG_SELECT = { id: true, name: true, nameKey: true, color: true } as const;

// Все запросы — с workspaceId в where: тег чужого пространства не находится (защита от IDOR).
export const tagRepository = {
  listByWorkspace(workspaceId: string) {
    return prisma.documentTag.findMany({
      where: { workspaceId },
      orderBy: { nameKey: 'asc' },
      select: {
        ...TAG_SELECT,
        _count: { select: { assignments: { where: { document: VISIBLE_DOCUMENT_WHERE } } } },
      },
    });
  },

  findInWorkspace(workspaceId: string, tagId: string) {
    return prisma.documentTag.findFirst({ where: { id: tagId, workspaceId }, select: TAG_SELECT });
  },

  /** Сколько из `tagIds` есть в пространстве. */
  countInWorkspaceByIds(workspaceId: string, tagIds: string[], tx: TransactionClient = prisma) {
    return tx.documentTag.count({ where: { workspaceId, id: { in: tagIds } } });
  },

  countInWorkspace(workspaceId: string) {
    return prisma.documentTag.count({ where: { workspaceId } });
  },

  async isNameTaken(workspaceId: string, nameKey: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.documentTag.findFirst({
      where: { workspaceId, nameKey, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  },

  create(data: { workspaceId: string; name: string; nameKey: string; color: string }) {
    return prisma.documentTag.create({ data, select: TAG_SELECT });
  },

  async update(
    workspaceId: string,
    tagId: string,
    data: { name: string; nameKey: string; color: string },
  ): Promise<number> {
    const { count } = await prisma.documentTag.updateMany({
      where: { id: tagId, workspaceId },
      data,
    });
    return count;
  },

  async delete(workspaceId: string, tagId: string): Promise<number> {
    const { count } = await prisma.documentTag.deleteMany({ where: { id: tagId, workspaceId } });
    return count;
  },

  /** Заменяет теги документа целиком. */
  async replaceDocumentTags(
    tx: TransactionClient,
    workspaceId: string,
    documentId: string,
    tagIds: string[],
  ): Promise<void> {
    await tx.documentTagAssignment.deleteMany({ where: { documentId, workspaceId } });
    if (tagIds.length > 0) {
      await tx.documentTagAssignment.createMany({
        data: tagIds.map((tagId) => ({ documentId, tagId, workspaceId })),
      });
    }
  },
};
