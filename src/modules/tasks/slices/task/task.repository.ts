import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma, type TransactionClient } from '@/shared/db';

import { TASK_PAGE_SIZE, type TaskCursor, type TaskPriority } from '../../models';

const PLACEMENT_SELECT = {
  orderBy: { project: { name: 'asc' } },
  select: {
    projectId: true,
    statusId: true,
    project: { select: { name: true } },
    status: { select: { name: true, color: true, category: true } },
  },
} as const satisfies Prisma.Task$placementsArgs;

const TASK_SELECT = {
  id: true,
  number: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  workspace: { select: { slug: true } },
  assignee: { select: { id: true, name: true, image: true } },
  createdBy: { select: { id: true, name: true } },
  placements: PLACEMENT_SELECT,
} as const satisfies Prisma.TaskSelect;

const TASK_LIST_SELECT = {
  id: true,
  number: true,
  title: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  assignee: { select: { id: true, name: true, image: true } },
  placements: PLACEMENT_SELECT,
} as const satisfies Prisma.TaskSelect;

export interface TaskWriteData {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  assigneeId: string | null;
}

// Все запросы — с workspaceId в where: задача чужого пространства не находится (защита от IDOR).
export const taskRepository = {
  /** Следующий номер задачи пространства — атомарно (строка счётчика блокируется до конца транзакции). */
  async nextNumber(tx: TransactionClient, workspaceId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
      INSERT INTO "WorkspaceTaskCounter" ("workspaceId", "lastNumber")
      VALUES (${workspaceId}, 1)
      ON CONFLICT ("workspaceId")
      DO UPDATE SET "lastNumber" = "WorkspaceTaskCounter"."lastNumber" + 1
      RETURNING "lastNumber"`;
    const number = rows[0]?.lastNumber;
    if (number === undefined) throw new Error('Task counter returned no rows');
    return number;
  },

  create(
    tx: TransactionClient,
    data: TaskWriteData & { workspaceId: string; number: number; createdById: string },
  ) {
    return tx.task.create({
      data,
      select: { id: true, number: true, workspace: { select: { slug: true } } },
    });
  },

  findByNumber(workspaceId: string, number: number) {
    return prisma.task.findFirst({ where: { workspaceId, number }, select: TASK_SELECT });
  },

  findById(workspaceId: string, taskId: string, db: TransactionClient = prisma) {
    return db.task.findFirst({ where: { id: taskId, workspaceId }, select: TASK_SELECT });
  },

  /** Частичное обновление задачи пространства; возвращает число изменённых строк (0 — не найдена). */
  async update(workspaceId: string, taskId: string, data: Partial<TaskWriteData>): Promise<number> {
    const { count } = await prisma.task.updateMany({ where: { id: taskId, workspaceId }, data });
    return count;
  },

  /** Удаляет задачу пространства (размещения — каскадом); возвращает число удалённых строк. */
  async delete(workspaceId: string, taskId: string): Promise<number> {
    const { count } = await prisma.task.deleteMany({ where: { id: taskId, workspaceId } });
    return count;
  },

  /** Страница списка: новые сверху; на одну строку больше, чтобы узнать, есть ли следующая. */
  listPage(workspaceId: string, cursor: TaskCursor | null) {
    return prisma.task.findMany({
      where: {
        workspaceId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: TASK_PAGE_SIZE + 1,
      select: TASK_LIST_SELECT,
    });
  },
};

export type TaskRow = NonNullable<Awaited<ReturnType<typeof taskRepository.findById>>>;
export type TaskListRow = Awaited<ReturnType<typeof taskRepository.listPage>>[number];
