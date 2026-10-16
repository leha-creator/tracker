import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import { VISIBLE_DOCUMENT_WHERE } from '../document/document.select';

/** Предохранитель рекурсивных запросов: глубже лимита дерева с запасом. */
const RECURSION_LIMIT = 32;

const FOLDER_SELECT = { id: true, workspaceId: true, parentId: true, name: true } as const;

// Все запросы — с workspaceId в where: папка чужого пространства не находится (защита от IDOR).
export const folderRepository = {
  listByWorkspace(workspaceId: string) {
    return prisma.documentFolder.findMany({
      where: { workspaceId },
      orderBy: { nameKey: 'asc' },
      select: {
        ...FOLDER_SELECT,
        _count: { select: { documents: { where: VISIBLE_DOCUMENT_WHERE } } },
      },
    });
  },

  findInWorkspace(workspaceId: string, folderId: string, tx: TransactionClient = prisma) {
    return tx.documentFolder.findFirst({
      where: { id: folderId, workspaceId },
      select: FOLDER_SELECT,
    });
  },

  /** Цепочка id от корня до папки включительно; пусто — папки нет в пространстве. */
  async pathIds(
    workspaceId: string,
    folderId: string,
    tx: TransactionClient = prisma,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT "id", "parentId", 1 AS depth FROM "DocumentFolder"
        WHERE "id" = ${folderId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT f."id", f."parentId", c.depth + 1 FROM "DocumentFolder" f
        JOIN chain c ON f."id" = c."parentId"
        WHERE f."workspaceId" = ${workspaceId} AND c.depth < ${RECURSION_LIMIT}
      )
      SELECT "id" FROM chain ORDER BY depth DESC`;
    return rows.map((row) => row.id);
  },

  /** Высота поддерева: 1 — папка без подпапок. */
  async subtreeHeight(
    workspaceId: string,
    folderId: string,
    tx: TransactionClient = prisma,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ height: number }[]>`
      WITH RECURSIVE tree AS (
        SELECT "id", 1 AS depth FROM "DocumentFolder"
        WHERE "id" = ${folderId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT f."id", t.depth + 1 FROM "DocumentFolder" f
        JOIN tree t ON f."parentId" = t."id"
        WHERE f."workspaceId" = ${workspaceId} AND t.depth < ${RECURSION_LIMIT}
      )
      SELECT COALESCE(MAX(depth), 0)::int AS height FROM tree`;
    return rows[0]?.height ?? 0;
  },

  /** Ключи файлов и число документов во всём поддереве папки (до удаления строк). */
  async subtreeContents(
    tx: TransactionClient,
    workspaceId: string,
    folderId: string,
  ): Promise<{ storageKeys: string[]; documentsCount: number }> {
    const rows = await tx.$queryRaw<{ storageKey: string | null }[]>`
      WITH RECURSIVE tree AS (
        SELECT "id", 1 AS depth FROM "DocumentFolder"
        WHERE "id" = ${folderId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT f."id", t.depth + 1 FROM "DocumentFolder" f
        JOIN tree t ON f."parentId" = t."id"
        WHERE f."workspaceId" = ${workspaceId} AND t.depth < ${RECURSION_LIMIT}
      )
      SELECT d."storageKey" FROM "Document" d
      JOIN tree t ON d."folderId" = t."id"
      WHERE d."workspaceId" = ${workspaceId}`;
    return {
      storageKeys: rows.flatMap((row) => (row.storageKey ? [row.storageKey] : [])),
      documentsCount: rows.length,
    };
  },

  async isNameTaken(
    workspaceId: string,
    parentId: string | null,
    nameKey: string,
    excludeId?: string,
    tx: TransactionClient = prisma,
  ): Promise<boolean> {
    const row = await tx.documentFolder.findFirst({
      where: { workspaceId, parentId, nameKey, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  },

  create(
    tx: TransactionClient,
    data: {
      workspaceId: string;
      parentId: string | null;
      name: string;
      nameKey: string;
      createdById: string;
    },
  ) {
    return tx.documentFolder.create({ data, select: FOLDER_SELECT });
  },

  async update(
    workspaceId: string,
    folderId: string,
    data: { name?: string; nameKey?: string; parentId?: string | null },
    tx: TransactionClient = prisma,
  ): Promise<number> {
    const { count } = await tx.documentFolder.updateMany({
      where: { id: folderId, workspaceId },
      data,
    });
    return count;
  },

  async delete(tx: TransactionClient, workspaceId: string, folderId: string): Promise<number> {
    const { count } = await tx.documentFolder.deleteMany({ where: { id: folderId, workspaceId } });
    return count;
  },
};
