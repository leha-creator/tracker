import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

const LABEL_SELECT = { id: true, name: true, nameKey: true, color: true } as const;

// Все запросы — с workspaceId в where: метка чужого пространства не находится (защита от IDOR).
export const labelRepository = {
  listByWorkspace(workspaceId: string) {
    return prisma.taskLabel.findMany({
      where: { workspaceId },
      orderBy: { nameKey: 'asc' },
      select: { ...LABEL_SELECT, _count: { select: { assignments: true } } },
    });
  },

  findInWorkspace(workspaceId: string, labelId: string) {
    return prisma.taskLabel.findFirst({
      where: { id: labelId, workspaceId },
      select: LABEL_SELECT,
    });
  },

  findByNameKeys(workspaceId: string, nameKeys: string[]) {
    return prisma.taskLabel.findMany({
      where: { workspaceId, nameKey: { in: nameKeys } },
      select: LABEL_SELECT,
    });
  },

  /** Метки пространства по id (чужие и несуществующие отсеиваются). */
  findManyInWorkspace(tx: TransactionClient, workspaceId: string, labelIds: string[]) {
    return tx.taskLabel.findMany({
      where: { workspaceId, id: { in: labelIds } },
      orderBy: { nameKey: 'asc' },
      select: LABEL_SELECT,
    });
  },

  countInWorkspace(workspaceId: string) {
    return prisma.taskLabel.count({ where: { workspaceId } });
  },

  async isNameTaken(workspaceId: string, nameKey: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.taskLabel.findFirst({
      where: { workspaceId, nameKey, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  },

  create(data: { workspaceId: string; name: string; nameKey: string; color: string }) {
    return prisma.taskLabel.create({ data, select: LABEL_SELECT });
  },

  async update(
    workspaceId: string,
    labelId: string,
    data: { name: string; nameKey: string; color: string },
  ): Promise<number> {
    const { count } = await prisma.taskLabel.updateMany({
      where: { id: labelId, workspaceId },
      data,
    });
    return count;
  },

  async delete(workspaceId: string, labelId: string): Promise<number> {
    const { count } = await prisma.taskLabel.deleteMany({ where: { id: labelId, workspaceId } });
    return count;
  },

  /** Текущие метки задачи. */
  async listTaskLabels(tx: TransactionClient, workspaceId: string, taskId: string) {
    const rows = await tx.taskLabelAssignment.findMany({
      where: { workspaceId, taskId },
      select: { label: { select: LABEL_SELECT } },
    });
    return rows.map((row) => row.label);
  },

  /** Заменяет метки задачи целиком. */
  async replaceTaskLabels(
    tx: TransactionClient,
    workspaceId: string,
    taskId: string,
    labelIds: string[],
  ): Promise<void> {
    await tx.taskLabelAssignment.deleteMany({ where: { workspaceId, taskId } });
    if (labelIds.length > 0) {
      await tx.taskLabelAssignment.createMany({
        data: labelIds.map((labelId) => ({ taskId, labelId, workspaceId })),
      });
    }
  },
};
