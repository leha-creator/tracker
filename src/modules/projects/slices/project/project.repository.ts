import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import type { PositionedStatus } from '../../models';

const PROJECT_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  createdAt: true,
  workspace: { select: { slug: true } },
} as const;

// Все запросы — с workspaceId в where: проект из чужого пространства не находится (защита от IDOR).
export const projectRepository = {
  listByWorkspace(workspaceId: string) {
    return prisma.project.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, _count: { select: { statuses: true } } },
    });
  },

  findInWorkspace(workspaceId: string, projectId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: PROJECT_SELECT,
    });
  },

  /** Занято ли название в пространстве (кроме проекта `exceptId`). */
  async isNameTaken(
    workspaceId: string,
    name: string,
    exceptId?: string,
    db: TransactionClient = prisma,
  ): Promise<boolean> {
    const row = await db.project.findFirst({
      where: { workspaceId, name, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  },

  countInWorkspace(tx: TransactionClient, workspaceId: string) {
    return tx.project.count({ where: { workspaceId } });
  },

  /** Создаёт проект вместе с начальным набором статусов (workspaceId статусов — из FK проекта). */
  createWithStatuses(
    tx: TransactionClient,
    data: { workspaceId: string; name: string; description: string | null; createdById: string },
    statuses: readonly PositionedStatus[],
  ) {
    return tx.project.create({
      data: {
        ...data,
        statuses: {
          create: statuses.map(({ name, category, color, position }) => ({
            name,
            category,
            color,
            position,
          })),
        },
      },
      select: PROJECT_SELECT,
    });
  },

  /** Обновляет проект пространства; возвращает число изменённых строк (0 — не найден). */
  async update(
    workspaceId: string,
    projectId: string,
    data: { name: string; description: string | null },
  ): Promise<number> {
    const { count } = await prisma.project.updateMany({
      where: { id: projectId, workspaceId },
      data,
    });
    return count;
  },

  /** Удаляет проект пространства (статусы — каскадом); возвращает число удалённых строк. */
  async delete(workspaceId: string, projectId: string): Promise<number> {
    const { count } = await prisma.project.deleteMany({ where: { id: projectId, workspaceId } });
    return count;
  },
};
