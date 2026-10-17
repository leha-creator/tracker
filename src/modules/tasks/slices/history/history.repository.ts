import 'server-only';

import type { Prisma, TaskHistoryKind } from '@/generated/prisma/client';
import { prisma, type TransactionClient } from '@/shared/db';

import type { HistoryAuthor } from '../../models';

const HISTORY_LIST_SELECT = {
  id: true,
  kind: true,
  source: true,
  data: true,
  createdAt: true,
  updatedAt: true,
  actor: { select: { id: true, name: true, image: true, isAgent: true } },
  viaToken: { select: { name: true } },
} as const satisfies Prisma.TaskHistoryEntrySelect;

export type HistoryListRow = Prisma.TaskHistoryEntryGetPayload<{
  select: typeof HISTORY_LIST_SELECT;
}>;

// Все запросы — с workspaceId в where (защита от IDOR).
export const historyRepository = {
  /** Последняя запись задачи — кандидат на слияние с новой правкой. */
  findLast(tx: TransactionClient, workspaceId: string, taskId: string) {
    return tx.taskHistoryEntry.findFirst({
      where: { workspaceId, taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        kind: true,
        actorId: true,
        viaTokenId: true,
        source: true,
        data: true,
        updatedAt: true,
      },
    });
  },

  create(
    tx: TransactionClient,
    entry: HistoryAuthor & {
      workspaceId: string;
      taskId: string;
      kind: TaskHistoryKind;
      data: Prisma.InputJsonValue;
    },
  ) {
    return tx.taskHistoryEntry.create({
      data: entry,
      select: { id: true, kind: true, updatedAt: true },
    });
  },

  async updateData(
    tx: TransactionClient,
    workspaceId: string,
    id: string,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.taskHistoryEntry.updateMany({ where: { id, workspaceId }, data: { data } });
  },

  async delete(tx: TransactionClient, workspaceId: string, id: string): Promise<void> {
    await tx.taskHistoryEntry.deleteMany({ where: { id, workspaceId } });
  },

  /** Записи задачи от новых к старым: последние `limit` или все. */
  async listForTask(
    workspaceId: string,
    taskId: string,
    limit?: number,
  ): Promise<{ total: number; rows: HistoryListRow[] }> {
    const where = { workspaceId, taskId };
    const [total, rows] = await Promise.all([
      prisma.taskHistoryEntry.count({ where }),
      prisma.taskHistoryEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: HISTORY_LIST_SELECT,
      }),
    ]);
    return { total, rows };
  },

  // ── Снимки имён для записей ──────────────────────────────────────────────────

  /** Имя пользователя — снимок для записи об ответственном. */
  userRef(tx: TransactionClient, userId: string) {
    return tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  },

  /** Статусы пространства с проектом — снимок для записей о статусе и проекте. */
  statusRefs(tx: TransactionClient, workspaceId: string, statusIds: string[]) {
    return tx.projectStatus.findMany({
      where: { workspaceId, id: { in: statusIds } },
      select: { id: true, name: true, project: { select: { id: true, name: true } } },
    });
  },

  /** Задачи пространства — снимок для записей о родителе. */
  taskRefs(tx: TransactionClient, workspaceId: string, taskIds: string[]) {
    return tx.task.findMany({
      where: { workspaceId, id: { in: taskIds } },
      select: { id: true, number: true, title: true, workspace: { select: { taskKey: true } } },
    });
  },
};
