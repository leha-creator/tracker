import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import type { PositionedStatus } from '../../models';

/** Размещения неархивных задач — для счётчиков проекта. */
const ACTIVE_PLACEMENTS = { where: { task: { archivedAt: null } } } as const;

const PROJECT_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  icon: true,
  createdAt: true,
  archivedAt: true,
  archivedBy: { select: { name: true } },
  workspace: { select: { slug: true } },
  _count: { select: { placements: ACTIVE_PLACEMENTS } },
} as const;

// Все запросы — с workspaceId в where: проект из чужого пространства не находится (защита от IDOR).
export const projectRepository = {
  /** Активные или (`archived`) архивные проекты пространства. */
  listByWorkspace(workspaceId: string, archived = false) {
    return prisma.project.findMany({
      where: { workspaceId, archivedAt: archived ? { not: null } : null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        updatedAt: true,
        archivedAt: true,
        _count: { select: { placements: ACTIVE_PLACEMENTS } },
        // Задачи по категориям — через число размещений в каждом статусе.
        statuses: {
          select: { category: true, _count: { select: { placements: ACTIVE_PLACEMENTS } } },
        },
      },
    });
  },

  /** Архивирует или восстанавливает проект; возвращает число изменённых строк. */
  async setArchived(
    workspaceId: string,
    projectId: string,
    data: { archivedAt: Date | null; archivedById: string | null },
  ): Promise<number> {
    const { count } = await prisma.project.updateMany({
      where: { id: projectId, workspaceId, archivedAt: data.archivedAt ? null : { not: null } },
      data,
    });
    return count;
  },

  /**
   * Сводка по задачам проектов пространства одним запросом: открытые просроченные (срок раньше
   * `today`, статус в проекте не «Готово» — как фильтр «Просрочено» в проекте), открытые задачи
   * пользователя и время последнего изменения задачи или её размещения.
   */
  async taskStatsByWorkspace(workspaceId: string, userId: string, today: string) {
    const rows = await prisma.$queryRaw<
      { projectId: string; overdue: bigint; mine: bigint; lastActivityAt: Date | null }[]
    >`
      SELECT p."projectId"::text AS "projectId",
        COUNT(*) FILTER (WHERE s."category" <> 'done' AND t."dueDate" < ${today}::date) AS "overdue",
        COUNT(*) FILTER (WHERE s."category" <> 'done' AND t."assigneeId" = ${userId}) AS "mine",
        GREATEST(MAX(p."updatedAt"), MAX(t."updatedAt")) AS "lastActivityAt"
      FROM "TaskPlacement" p
      JOIN "ProjectStatus" s ON s."id" = p."statusId"
      JOIN "Task" t ON t."id" = p."taskId"
      WHERE p."workspaceId" = ${workspaceId} AND t."archivedAt" IS NULL
      GROUP BY p."projectId"`;
    return rows.map((row) => ({
      projectId: row.projectId,
      overdue: Number(row.overdue),
      mine: Number(row.mine),
      lastActivityAt: row.lastActivityAt,
    }));
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
    data: {
      workspaceId: string;
      name: string;
      description: string | null;
      icon: string | null;
      createdById: string;
    },
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
    data: { name: string; description: string | null; icon?: string },
  ): Promise<number> {
    const { count } = await prisma.project.updateMany({
      where: { id: projectId, workspaceId },
      data,
    });
    return count;
  },

  /**
   * Удаляет проект пространства; статусы и размещения задач — каскадом (задачи остаются
   * в пространстве). Возвращает число удалённых строк.
   */
  async delete(workspaceId: string, projectId: string): Promise<number> {
    const { count } = await prisma.project.deleteMany({ where: { id: projectId, workspaceId } });
    return count;
  },
};
