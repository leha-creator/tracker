import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

// Все запросы — с workspaceId в where (защита от IDOR).
export const placementRepository = {
  /**
   * Статус пространства по id — только чтение для проверки цели размещения. Статусы принадлежат
   * модулю projects; целостность «статус ∈ проект ∈ пространство» гарантируют составные FK.
   */
  findStatus(tx: TransactionClient, workspaceId: string, statusId: string) {
    return tx.projectStatus.findFirst({
      where: { id: statusId, workspaceId },
      select: { id: true, projectId: true, category: true },
    });
  },

  async taskExists(tx: TransactionClient, workspaceId: string, taskId: string): Promise<boolean> {
    const row = await tx.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    return row !== null;
  },

  /** Позиция последней карточки колонки (побайтный порядок — колонка с COLLATE "C"). */
  async lastPosition(
    tx: TransactionClient,
    workspaceId: string,
    projectId: string,
    statusId: string,
  ): Promise<string | null> {
    const row = await tx.taskPlacement.findFirst({
      where: { workspaceId, projectId, statusId },
      orderBy: [{ position: 'desc' }, { taskId: 'desc' }],
      select: { position: true },
    });
    return row?.position ?? null;
  },

  /** Карточки колонки (без сортировки: порядок задаёт comparePositions в модели). */
  listColumn(tx: TransactionClient, workspaceId: string, projectId: string, statusId: string) {
    return tx.taskPlacement.findMany({
      where: { workspaceId, projectId, statusId },
      select: { taskId: true, position: true },
    });
  },

  /** Новые позиции карточек колонки (перенумерация при равных ключах). */
  async updatePositions(
    tx: TransactionClient,
    workspaceId: string,
    projectId: string,
    rows: readonly { taskId: string; position: string }[],
  ): Promise<void> {
    for (const row of rows) {
      await tx.taskPlacement.updateMany({
        where: { workspaceId, projectId, taskId: row.taskId },
        data: { position: row.position },
      });
    }
  },

  find(tx: TransactionClient, workspaceId: string, taskId: string, projectId: string) {
    return tx.taskPlacement.findFirst({
      where: { workspaceId, taskId, projectId },
      select: { taskId: true, projectId: true, statusId: true, position: true },
    });
  },

  async listProjectIds(
    tx: TransactionClient,
    workspaceId: string,
    taskId: string,
  ): Promise<string[]> {
    const rows = await tx.taskPlacement.findMany({
      where: { workspaceId, taskId },
      select: { projectId: true },
    });
    return rows.map((row) => row.projectId);
  },

  create(
    tx: TransactionClient,
    data: {
      workspaceId: string;
      taskId: string;
      projectId: string;
      statusId: string;
      position: string;
    },
  ) {
    return tx.taskPlacement.create({ data, select: { taskId: true } });
  },

  async updateStatus(
    tx: TransactionClient,
    workspaceId: string,
    key: { taskId: string; projectId: string },
    data: { statusId: string; position: string },
  ): Promise<number> {
    const { count } = await tx.taskPlacement.updateMany({
      where: { workspaceId, taskId: key.taskId, projectId: key.projectId },
      data,
    });
    return count;
  },

  async delete(
    workspaceId: string,
    key: { taskId: string; projectId: string },
    db: TransactionClient = prisma,
  ): Promise<number> {
    const { count } = await db.taskPlacement.deleteMany({
      where: { workspaceId, taskId: key.taskId, projectId: key.projectId },
    });
    return count;
  },
};
