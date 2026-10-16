import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

import { TASK_MAX_DEPTH } from '../../models';
import { TASK_LIST_SELECT } from '../task/task.select';

/** Предохранитель рекурсивных запросов: дерево глубже лимита не строится даже при порче данных. */
const RECURSION_LIMIT = TASK_MAX_DEPTH + 1;

/** Поля подзадачи в разделе «Подзадачи»: строка списка + число своих подзадач. */
const CHILD_SELECT = {
  ...TASK_LIST_SELECT,
  _count: { select: { subtasks: true } },
} as const;

// Все запросы — с workspaceId в where и в каждом шаге рекурсии (защита от IDOR).
export const subtaskRepository = {
  /** Блокирует дерево задач пространства до конца транзакции: изменения дерева — по одному. */
  async lockTree(tx: TransactionClient, workspaceId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tasks-tree:${workspaceId}`}))`;
  },

  /** Цепочка id от корня до задачи включительно; пусто — задачи нет в пространстве. */
  async pathIds(
    workspaceId: string,
    taskId: string,
    tx: TransactionClient = prisma,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT "id", "parentId", 1 AS depth FROM "Task"
        WHERE "id" = ${taskId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT t."id", t."parentId", c.depth + 1 FROM "Task" t
        JOIN chain c ON t."id" = c."parentId"
        WHERE t."workspaceId" = ${workspaceId} AND c.depth < ${RECURSION_LIMIT}
      )
      SELECT "id"::text AS "id" FROM chain ORDER BY depth DESC`;
    return rows.map((row) => row.id);
  },

  /** Предки задачи от корня к родителю (без самой задачи) — для хлебных крошек. */
  async ancestors(
    workspaceId: string,
    taskId: string,
  ): Promise<{ id: string; number: number; title: string }[]> {
    return prisma.$queryRaw<{ id: string; number: number; title: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT "parentId", 0 AS depth FROM "Task"
        WHERE "id" = ${taskId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT t."parentId", c.depth + 1 FROM "Task" t
        JOIN chain c ON t."id" = c."parentId"
        WHERE t."workspaceId" = ${workspaceId} AND c.depth < ${RECURSION_LIMIT}
      )
      SELECT t."id"::text AS "id", t."number", t."title" FROM chain c
      JOIN "Task" t ON t."id" = c."parentId" AND t."workspaceId" = ${workspaceId}
      ORDER BY c.depth DESC`;
  },

  /** id задачи и всех её потомков (сама задача — первой). */
  async subtreeIds(
    workspaceId: string,
    taskId: string,
    tx: TransactionClient = prisma,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT "id", 1 AS depth FROM "Task"
        WHERE "id" = ${taskId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT t."id", tr.depth + 1 FROM "Task" t
        JOIN tree tr ON t."parentId" = tr."id"
        WHERE t."workspaceId" = ${workspaceId} AND tr.depth < ${RECURSION_LIMIT}
      )
      SELECT "id"::text AS "id" FROM tree ORDER BY depth`;
    return rows.map((row) => row.id);
  },

  /** Высота поддерева: 1 — задача без подзадач, 0 — задачи нет. */
  async subtreeHeight(
    workspaceId: string,
    taskId: string,
    tx: TransactionClient = prisma,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ height: number }[]>`
      WITH RECURSIVE tree AS (
        SELECT "id", 1 AS depth FROM "Task"
        WHERE "id" = ${taskId}::uuid AND "workspaceId" = ${workspaceId}
        UNION ALL
        SELECT t."id", tr.depth + 1 FROM "Task" t
        JOIN tree tr ON t."parentId" = tr."id"
        WHERE t."workspaceId" = ${workspaceId} AND tr.depth < ${RECURSION_LIMIT}
      )
      SELECT COALESCE(MAX(depth), 0)::int AS height FROM tree`;
    return rows[0]?.height ?? 0;
  },

  /** Число прямых подзадач. */
  countChildren(
    workspaceId: string,
    parentId: string,
    tx: TransactionClient = prisma,
  ): Promise<number> {
    return tx.task.count({ where: { workspaceId, parentId } });
  },

  /** Прямые подзадачи по номеру. */
  listChildren(workspaceId: string, parentId: string) {
    return prisma.task.findMany({
      where: { workspaceId, parentId },
      orderBy: { number: 'asc' },
      select: CHILD_SELECT,
    });
  },

  /** Категории статусов подзадач нескольких родителей — для прогресса одним запросом. */
  childrenCategories(workspaceId: string, parentIds: string[]) {
    if (parentIds.length === 0) return Promise.resolve([]);
    return prisma.task.findMany({
      where: { workspaceId, parentId: { in: parentIds } },
      select: {
        parentId: true,
        placements: { select: { status: { select: { category: true } } } },
      },
    });
  },

  /** Сменить родителя; возвращает число изменённых строк (0 — задачи нет в пространстве). */
  async setParent(
    tx: TransactionClient,
    workspaceId: string,
    taskId: string,
    parentId: string | null,
  ): Promise<number> {
    const { count } = await tx.task.updateMany({
      where: { id: taskId, workspaceId },
      data: { parentId },
    });
    return count;
  },

  /** Кандидаты в родители: по номеру или части названия, без исключённых id. */
  searchCandidates(
    workspaceId: string,
    input: { number?: number; text: string; excludeIds: string[]; take: number },
  ) {
    const { number, text, excludeIds, take } = input;
    return prisma.task.findMany({
      where: {
        workspaceId,
        id: { notIn: excludeIds },
        ...(text && {
          OR: [
            ...(number !== undefined ? [{ number }] : []),
            { title: { contains: text, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: { number: 'desc' },
      take,
      select: { id: true, number: true, title: true, workspace: { select: { taskKey: true } } },
    });
  },
};

export type SubtaskRow = Awaited<ReturnType<typeof subtaskRepository.listChildren>>[number];
