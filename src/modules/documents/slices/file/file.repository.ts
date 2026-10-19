import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

const FILE_SELECT = {
  id: true,
  workspaceId: true,
  kind: true,
  title: true,
  content: true,
  fileName: true,
  extension: true,
  contentType: true,
  size: true,
  storageKey: true,
  status: true,
  createdById: true,
} as const;

// Запросы по документу пространства — с workspaceId в where (защита от IDOR). Исключение —
// `findById` для ссылки скачивания: сервис сразу проверяет доступ к пространству найденной строки.
export const fileRepository = {
  findById(documentId: string) {
    return prisma.document.findUnique({ where: { id: documentId }, select: FILE_SELECT });
  },

  findInWorkspace(workspaceId: string, documentId: string) {
    return prisma.document.findFirst({
      where: { id: documentId, workspaceId },
      select: FILE_SELECT,
    });
  },

  /** Блокирует квоту пространства до конца транзакции: параллельные загрузки — по очереди. */
  async lockQuota(tx: TransactionClient, workspaceId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents-quota:${workspaceId}`}))`;
  },

  /**
   * Своя квота пространства, МБ (null — по умолчанию). Чтение поля Workspace модуля workspaces:
   * квоту задаёт администратор, применяет её этот модуль.
   */
  async findQuotaMb(workspaceId: string, tx: TransactionClient = prisma): Promise<number | null> {
    const row = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { storageQuotaMb: true },
    });
    return row?.storageQuotaMb ?? null;
  },

  /** Свои квоты нескольких пространств — для админки. */
  async quotasByWorkspaces(workspaceIds: readonly string[]): Promise<Map<string, number | null>> {
    const rows = await prisma.workspace.findMany({
      where: { id: { in: [...workspaceIds] } },
      select: { id: true, storageQuotaMb: true },
    });
    return new Map(rows.map((row) => [row.id, row.storageQuotaMb]));
  },

  /** Файлы документов всего ресурса — для обзора админки. */
  async totalUsage(): Promise<{ usedBytes: number; filesCount: number }> {
    const result = await prisma.document.aggregate({
      where: { kind: 'file' },
      _sum: { size: true },
      _count: { _all: true },
    });
    return { usedBytes: result._sum.size ?? 0, filesCount: result._count._all };
  },

  /** Занято в хранилище нескольких пространств одним запросом — для админки. */
  async usageByWorkspaces(
    workspaceIds: readonly string[],
  ): Promise<Map<string, { usedBytes: number; filesCount: number }>> {
    const rows = await prisma.document.groupBy({
      by: ['workspaceId'],
      where: { workspaceId: { in: [...workspaceIds] }, kind: 'file' },
      _sum: { size: true },
      _count: { _all: true },
    });
    return new Map(
      rows.map((row) => [
        row.workspaceId,
        { usedBytes: row._sum.size ?? 0, filesCount: row._count._all },
      ]),
    );
  },

  /** Занято в хранилище пространства: подтверждённые файлы и незавершённые загрузки. */
  async usage(
    workspaceId: string,
    tx: TransactionClient = prisma,
  ): Promise<{ usedBytes: number; filesCount: number }> {
    const result = await tx.document.aggregate({
      where: { workspaceId, kind: 'file' },
      _sum: { size: true },
      _count: { _all: true },
    });
    return { usedBytes: result._sum.size ?? 0, filesCount: result._count._all };
  },

  createPending(
    tx: TransactionClient,
    data: {
      workspaceId: string;
      folderId: string | null;
      title: string;
      titleKey: string;
      fileName: string;
      extension: string;
      contentType: string;
      size: number;
      storageKey: string;
      userId: string;
      /** Токен MCP, через который загружен файл (пометка «через агента»). */
      createdViaTokenId: string | null;
    },
  ) {
    const { userId, ...rest } = data;
    return tx.document.create({
      data: { ...rest, kind: 'file', status: 'pending', createdById: userId, updatedById: userId },
      select: { id: true },
    });
  },

  /** pending → ready; 0 — уже подтверждён или удалён. */
  async markReady(workspaceId: string, documentId: string, uploadedAt: Date): Promise<number> {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId, workspaceId, kind: 'file', status: 'pending' },
      data: { status: 'ready', uploadedAt },
    });
    return count;
  },

  async delete(workspaceId: string, documentId: string): Promise<number> {
    const { count } = await prisma.document.deleteMany({ where: { id: documentId, workspaceId } });
    return count;
  },

  /** Брошенные загрузки пользователя старше `before`. */
  findStale(userId: string, before: Date, take: number) {
    return prisma.document.findMany({
      where: { createdById: userId, kind: 'file', status: 'pending', createdAt: { lt: before } },
      select: { id: true, storageKey: true },
      take,
    });
  },

  async deleteByIds(ids: string[]): Promise<number> {
    const { count } = await prisma.document.deleteMany({
      where: { id: { in: ids }, status: 'pending' },
    });
    return count;
  },
};
