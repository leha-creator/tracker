import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import type { StatusSet } from '../../models';

// Все запросы — с workspaceId и projectId в where (защита от IDOR).
export const statusRepository = {
  listByProject(workspaceId: string, projectId: string, db: TransactionClient = prisma) {
    return db.projectStatus.findMany({
      where: { workspaceId, projectId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        color: true,
        position: true,
        _count: { select: { placements: true } },
      },
    });
  },

  /** Статусы всех проектов пространства (для селектов статуса) — один запрос. */
  listByWorkspace(workspaceId: string) {
    return prisma.projectStatus.findMany({
      where: { workspaceId },
      orderBy: [{ projectId: 'asc' }, { position: 'asc' }],
      select: {
        id: true,
        projectId: true,
        name: true,
        category: true,
        color: true,
        position: true,
        _count: { select: { placements: true } },
      },
    });
  },

  /**
   * Переносит задачи удаляемого статуса в другой статус проекта. Исключение из правила владения
   * таблицами: размещения принадлежат модулю tasks, но жизненный цикл колонки — проектам, а модуль
   * projects не зависит от tasks. Меняется только statusId; дробные позиции двух колонок
   * корректно сливаются в одну. Возвращает число перенесённых задач.
   */
  async reassignPlacements(
    tx: TransactionClient,
    workspaceId: string,
    projectId: string,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<number> {
    const { count } = await tx.taskPlacement.updateMany({
      where: { workspaceId, projectId, statusId: fromStatusId },
      data: { statusId: toStatusId },
    });
    return count;
  },

  /**
   * Блокирует строку проекта до конца транзакции: параллельные изменения набора статусов
   * выполняются по очереди и не перезаписывают друг друга. null — проекта нет в пространстве.
   */
  async lockProject(
    tx: TransactionClient,
    workspaceId: string,
    projectId: string,
  ): Promise<{ archivedAt: Date | null } | null> {
    const rows = await tx.$queryRaw<{ archivedAt: Date | null }[]>`
      SELECT "archivedAt" FROM "Project"
      WHERE "id" = ${projectId}::uuid AND "workspaceId" = ${workspaceId}
      FOR UPDATE`;
    return rows[0] ?? null;
  },

  /**
   * Сохраняет набор: удаляет убранные статусы, обновляет сохранённые (поля и позиции),
   * создаёт новые. Возвращает id созданных статусов.
   */
  async saveSet(
    tx: TransactionClient,
    workspaceId: string,
    projectId: string,
    set: StatusSet,
  ): Promise<string[]> {
    if (set.removedIds.length > 0) {
      await tx.projectStatus.deleteMany({
        where: { id: { in: [...set.removedIds] }, workspaceId, projectId },
      });
    }

    const createdIds: string[] = [];
    for (const { id, name, category, color, position } of set.statuses) {
      if (id) {
        await tx.projectStatus.updateMany({
          where: { id, workspaceId, projectId },
          data: { name, category, color, position },
        });
      } else {
        const created = await tx.projectStatus.create({
          data: { workspaceId, projectId, name, category, color, position },
          select: { id: true },
        });
        createdIds.push(created.id);
      }
    }
    return createdIds;
  },
};
