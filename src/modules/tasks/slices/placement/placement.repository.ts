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

  /** Архивность задачи и проекта; null — задачи или проекта нет в пространстве. */
  async findArchiveState(
    tx: TransactionClient,
    workspaceId: string,
    taskId: string,
    projectId: string,
  ): Promise<{ taskArchived: boolean; projectArchived: boolean } | null> {
    const task = await tx.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { archivedAt: true },
    });
    const project = await tx.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { archivedAt: true },
    });
    if (!task || !project) return null;
    return { taskArchived: task.archivedAt !== null, projectArchived: project.archivedAt !== null };
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

  /** Размещения задач с категорией статуса (для автосмены статуса интеграциями). */
  listWithCategory(workspaceId: string, taskIds: string[]) {
    // Архивные задачи и проекты автосмена статуса не трогает.
    return prisma.taskPlacement.findMany({
      where: {
        workspaceId,
        taskId: { in: taskIds },
        task: { archivedAt: null },
        project: { archivedAt: null },
      },
      select: {
        taskId: true,
        projectId: true,
        statusId: true,
        status: { select: { category: true } },
      },
    });
  },

  find(tx: TransactionClient, workspaceId: string, taskId: string, projectId: string) {
    return tx.taskPlacement.findFirst({
      where: { workspaceId, taskId, projectId },
      select: { taskId: true, projectId: true, statusId: true, position: true },
    });
  },

  /** Проекты, где размещена хотя бы одна из задач (доски для события реалтайма). */
  async listProjectIdsOfTasks(workspaceId: string, taskIds: readonly string[]): Promise<string[]> {
    if (taskIds.length === 0) return [];
    const rows = await prisma.taskPlacement.findMany({
      where: { workspaceId, taskId: { in: [...taskIds] } },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    return rows.map((row) => row.projectId);
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
