import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import type { DocumentRow } from './document.select';
import { DOCUMENT_SELECT, VISIBLE_DOCUMENT_WHERE } from './document.select';

// Все запросы — с workspaceId в where: документ чужого пространства не находится (защита от IDOR).
export const documentRepository = {
  /** Заметка или подтверждённый файл пространства. Незавершённая загрузка не находится. */
  findVisible(
    workspaceId: string,
    documentId: string,
    tx: TransactionClient = prisma,
  ): Promise<DocumentRow | null> {
    return tx.document.findFirst({
      where: { id: documentId, workspaceId, ...VISIBLE_DOCUMENT_WHERE },
      select: DOCUMENT_SELECT,
    });
  },

  createNote(data: {
    workspaceId: string;
    folderId: string | null;
    title: string;
    titleKey: string;
    content: string;
    userId: string;
    /** Токен MCP, через который создана заметка (пометка «через агента»). */
    createdViaTokenId: string | null;
  }): Promise<DocumentRow> {
    const { userId, ...rest } = data;
    return prisma.document.create({
      data: { ...rest, kind: 'note', createdById: userId, updatedById: userId },
      select: DOCUMENT_SELECT,
    });
  },

  /**
   * Сохраняет заметку, только если её версия не изменилась (оптимистичная блокировка).
   * 0 — заметку уже изменил кто-то другой (или её нет).
   */
  async updateNote(
    workspaceId: string,
    documentId: string,
    expectedVersion: number,
    data: { title: string; titleKey: string; content: string; userId: string },
  ): Promise<number> {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId, workspaceId, kind: 'note', version: expectedVersion },
      data: {
        title: data.title,
        titleKey: data.titleKey,
        content: data.content,
        updatedById: data.userId,
        version: { increment: 1 },
      },
    });
    return count;
  },

  async update(
    workspaceId: string,
    documentId: string,
    data: {
      title?: string;
      titleKey?: string;
      fileName?: string;
      folderId?: string | null;
      updatedById: string;
    },
  ): Promise<number> {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId, workspaceId },
      data,
    });
    return count;
  },

  findVersion(workspaceId: string, documentId: string) {
    return prisma.document.findFirst({
      where: { id: documentId, workspaceId },
      select: { version: true, updatedAt: true },
    });
  },

  async delete(workspaceId: string, documentId: string): Promise<number> {
    const { count } = await prisma.document.deleteMany({ where: { id: documentId, workspaceId } });
    return count;
  },
};
