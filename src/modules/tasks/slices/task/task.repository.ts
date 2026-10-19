import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma, type TransactionClient } from '@/shared/db';

import type { TaskPriority } from '../../models';
import { PLACEMENT_SELECT, TASK_LABELS_SELECT } from './task.select';

const TASK_SELECT = {
  id: true,
  number: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  createdById: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { subtasks: true } },
  workspace: { select: { slug: true, name: true, taskKey: true } },
  assignee: { select: { id: true, name: true, image: true } },
  createdBy: { select: { id: true, name: true, isAgent: true } },
  createdViaToken: { select: { name: true } },
  archivedAt: true,
  archivedBy: { select: { id: true, name: true } },
  placements: PLACEMENT_SELECT,
  labels: TASK_LABELS_SELECT,
} as const satisfies Prisma.TaskSelect;

/** Поля задачи для ссылок из интеграций (TSK-42 в GitHub). */
const TASK_REF_SELECT = {
  id: true,
  number: true,
  title: true,
  assigneeId: true,
  createdById: true,
  workspace: { select: { taskKey: true } },
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
    data: TaskWriteData & {
      workspaceId: string;
      number: number;
      createdById: string;
      /** Токен MCP, через который создана задача (пометка «через агента»). */
      createdViaTokenId: string | null;
      parentId: string | null;
    },
  ) {
    return tx.task.create({
      data,
      select: {
        id: true,
        number: true,
        title: true,
        workspace: { select: { slug: true, name: true, taskKey: true } },
      },
    });
  },

  findByNumber(workspaceId: string, number: number) {
    return prisma.task.findFirst({ where: { workspaceId, number }, select: TASK_SELECT });
  },

  findById(workspaceId: string, taskId: string, db: TransactionClient = prisma) {
    return db.task.findFirst({ where: { id: taskId, workspaceId }, select: TASK_SELECT });
  },

  /** Частичное обновление задачи пространства; возвращает число изменённых строк (0 — не найдена). */
  async update(
    workspaceId: string,
    taskId: string,
    data: Partial<TaskWriteData>,
    db: TransactionClient = prisma,
  ): Promise<number> {
    const { count } = await db.task.updateMany({ where: { id: taskId, workspaceId }, data });
    return count;
  },

  /** Удаляет задачу пространства (размещения — каскадом); возвращает число удалённых строк. */
  async delete(workspaceId: string, taskId: string): Promise<number> {
    const { count } = await prisma.task.deleteMany({ where: { id: taskId, workspaceId } });
    return count;
  },

  /** Архивность задачи и её родителя; null — задачи нет в пространстве. */
  findArchiveState(workspaceId: string, taskId: string, db: TransactionClient = prisma) {
    return db.task.findFirst({
      where: { id: taskId, workspaceId },
      select: {
        archivedAt: true,
        number: true,
        title: true,
        workspace: { select: { taskKey: true } },
        parent: { select: { archivedAt: true } },
      },
    });
  },

  /** Архивирует задачи поддерева, ещё не бывшие в архиве. Возвращает число задач. */
  async archiveMany(
    tx: TransactionClient,
    workspaceId: string,
    taskIds: string[],
    data: { archivedAt: Date; archivedById: string },
  ): Promise<number> {
    const { count } = await tx.task.updateMany({
      where: { workspaceId, id: { in: taskIds }, archivedAt: null },
      data,
    });
    return count;
  },

  /** Восстанавливает задачи поддерева, попавшие в архив той же операцией (общий archivedAt). */
  async restoreMany(
    tx: TransactionClient,
    workspaceId: string,
    taskIds: string[],
    archivedAt: Date,
  ): Promise<number> {
    const { count } = await tx.task.updateMany({
      where: { workspaceId, id: { in: taskIds }, archivedAt },
      data: { archivedAt: null, archivedById: null },
    });
    return count;
  },

  /** Задачи пространства по номерам — для ссылок из интеграций (TSK-42). */
  listByNumbers(workspaceId: string, numbers: number[]) {
    return prisma.task.findMany({
      where: { workspaceId, number: { in: numbers } },
      select: TASK_REF_SELECT,
    });
  },

  /** Задачи пространства по id — для связей из интеграций. */
  listRefsByIds(workspaceId: string, taskIds: string[]) {
    return prisma.task.findMany({
      where: { workspaceId, id: { in: taskIds } },
      select: TASK_REF_SELECT,
    });
  },
};

export type TaskRow = NonNullable<Awaited<ReturnType<typeof taskRepository.findById>>>;
