import 'server-only';

import { prisma } from '@/shared/db';

import { DOCUMENT_SUMMARY_SELECT, VISIBLE_DOCUMENT_WHERE } from '../document/document.select';

// Все запросы — с workspaceId в where: связь чужого пространства не находится (защита от IDOR).
export const taskLinkRepository = {
  /** Документы задачи: заметки и подтверждённые файлы, новые связи сверху. */
  listDocumentsForTask(workspaceId: string, taskId: string) {
    return prisma.document.findMany({
      where: { workspaceId, ...VISIBLE_DOCUMENT_WHERE, taskLinks: { some: { taskId } } },
      orderBy: { titleKey: 'asc' },
      select: DOCUMENT_SUMMARY_SELECT,
    });
  },

  async listTaskIdsForDocument(workspaceId: string, documentId: string): Promise<string[]> {
    const rows = await prisma.taskDocumentLink.findMany({
      where: { workspaceId, documentId },
      orderBy: { createdAt: 'desc' },
      select: { taskId: true },
    });
    return rows.map((row) => row.taskId);
  },

  countForTask(workspaceId: string, taskId: string): Promise<number> {
    return prisma.taskDocumentLink.count({ where: { workspaceId, taskId } });
  },

  async exists(workspaceId: string, taskId: string, documentId: string): Promise<boolean> {
    const row = await prisma.taskDocumentLink.findFirst({
      where: { workspaceId, taskId, documentId },
      select: { taskId: true },
    });
    return row !== null;
  },

  /** Повторная привязка не создаёт дубль и не падает. */
  async create(data: {
    workspaceId: string;
    taskId: string;
    documentId: string;
    createdById: string;
  }): Promise<number> {
    const { count } = await prisma.taskDocumentLink.createMany({ data, skipDuplicates: true });
    return count;
  },

  async delete(workspaceId: string, taskId: string, documentId: string): Promise<number> {
    const { count } = await prisma.taskDocumentLink.deleteMany({
      where: { workspaceId, taskId, documentId },
    });
    return count;
  },

  /** Документы по названию для выбора в задаче (без уже привязанных к `excludeTaskId`). */
  searchDocuments(input: { workspaceId: string; q: string; excludeTaskId?: string; take: number }) {
    const { workspaceId, q, excludeTaskId, take } = input;
    return prisma.document.findMany({
      where: {
        workspaceId,
        ...VISIBLE_DOCUMENT_WHERE,
        ...(q ? { titleKey: { contains: q.toLocaleLowerCase('ru') } } : {}),
        ...(excludeTaskId ? { taskLinks: { none: { taskId: excludeTaskId } } } : {}),
      },
      orderBy: q ? { titleKey: 'asc' } : { updatedAt: 'desc' },
      take,
      select: DOCUMENT_SUMMARY_SELECT,
    });
  },
};
