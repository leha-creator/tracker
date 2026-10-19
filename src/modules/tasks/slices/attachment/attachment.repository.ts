import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import type { AttachmentTarget } from '../../models';
import type { AttachmentKey } from './attachment.schema';
import { ATTACHMENT_SELECT } from './attachment.select';

function whereKey({ workspaceId, taskId, attachmentId }: AttachmentKey) {
  return { id: attachmentId, taskId, workspaceId } satisfies Prisma.TaskAttachmentWhereInput;
}

/** Ключи хранилища по условию. */
async function keysWhere(where: Prisma.TaskAttachmentWhereInput): Promise<string[]> {
  const rows = await prisma.taskAttachment.findMany({ where, select: { storageKey: true } });
  return rows.map((row) => row.storageKey);
}

// Запросы по вложению задачи — с workspaceId и taskId в where (защита от IDOR). Исключение —
// `findById` для ссылки скачивания: сервис сразу проверяет доступ к пространству найденной строки.
export const attachmentRepository = {
  /** Задача есть в пространстве? */
  async taskExists(workspaceId: string, taskId: string): Promise<boolean> {
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    return task !== null;
  },

  /**
   * Сколько файлов уже занимает лимит: в блоке задачи — все (включая незавершённые загрузки),
   * для комментария — черновики загружающего в этой задаче.
   */
  countForTarget(input: {
    workspaceId: string;
    taskId: string;
    target: AttachmentTarget;
    uploaderId: string;
  }): Promise<number> {
    const { workspaceId, taskId, target, uploaderId } = input;
    return prisma.taskAttachment.count({
      where:
        target === 'task'
          ? { workspaceId, taskId, target }
          : { workspaceId, taskId, target, commentId: null, uploaderId },
    });
  },

  createPending(data: {
    workspaceId: string;
    taskId: string;
    target: AttachmentTarget;
    uploaderId: string;
    fileName: string;
    contentType: string;
    size: number;
    storageKey: string;
  }) {
    return prisma.taskAttachment.create({ data, select: { id: true } });
  },

  findById(attachmentId: string) {
    return prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: ATTACHMENT_SELECT,
    });
  },

  find(key: AttachmentKey) {
    return prisma.taskAttachment.findFirst({ where: whereKey(key), select: ATTACHMENT_SELECT });
  },

  /** pending → ready; возвращает число изменённых строк (0 — уже подтверждён или удалён). */
  async markReady(key: AttachmentKey, uploadedAt: Date): Promise<number> {
    const { count } = await prisma.taskAttachment.updateMany({
      where: { ...whereKey(key), status: 'pending' },
      data: { status: 'ready', uploadedAt },
    });
    return count;
  },

  /** Возвращает число удалённых строк (0 — не найден). */
  async delete(key: AttachmentKey): Promise<number> {
    const { count } = await prisma.taskAttachment.deleteMany({ where: whereKey(key) });
    return count;
  },

  /** Готовые файлы блока «Вложения» задачи, от старых к новым. */
  listForTask(workspaceId: string, taskId: string) {
    return prisma.taskAttachment.findMany({
      where: { workspaceId, taskId, target: 'task', status: 'ready' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ATTACHMENT_SELECT,
    });
  },

  /** Текст комментария и число его готовых файлов — для правила «комментарий не пустой». */
  async commentContent(workspaceId: string, taskId: string, commentId: string) {
    const comment = await prisma.taskComment.findFirst({
      where: { id: commentId, taskId, workspaceId },
      select: { body: true, _count: { select: { attachments: { where: { status: 'ready' } } } } },
    });
    return comment
      ? { bodyLength: comment.body.length, attachments: comment._count.attachments }
      : null;
  },

  /** Брошенные загрузки пользователя: не подтверждённые или неотправленные черновики. */
  findStale(uploaderId: string, before: Date, take: number) {
    return prisma.taskAttachment.findMany({
      where: {
        uploaderId,
        createdAt: { lt: before },
        OR: [{ status: 'pending' }, { target: 'comment', commentId: null }],
      },
      orderBy: { createdAt: 'asc' },
      take,
      select: { id: true, storageKey: true },
    });
  },

  async deleteByIds(ids: string[]): Promise<number> {
    const { count } = await prisma.taskAttachment.deleteMany({ where: { id: { in: ids } } });
    return count;
  },

  /**
   * Привязывает готовые черновики автора к новому комментарию той же задачи. Возвращает число
   * привязанных: меньше переданного — часть файлов чужая, удалена или не загружена.
   */
  async bindToComment(
    tx: Prisma.TransactionClient,
    input: {
      ids: string[];
      workspaceId: string;
      taskId: string;
      uploaderId: string;
      commentId: string;
    },
  ): Promise<number> {
    const { ids, workspaceId, taskId, uploaderId, commentId } = input;
    const { count } = await tx.taskAttachment.updateMany({
      where: {
        id: { in: ids },
        workspaceId,
        taskId,
        uploaderId,
        target: 'comment',
        commentId: null,
        status: 'ready',
      },
      data: { commentId },
    });
    return count;
  },

  /** Ключи вложений нескольких задач (поддерево при удалении) — вместе с вложениями комментариев. */
  keysForTasks(workspaceId: string, taskIds: string[]): Promise<string[]> {
    return keysWhere({ workspaceId, taskId: { in: taskIds } });
  },

  keysForComment(workspaceId: string, taskId: string, commentId: string): Promise<string[]> {
    return keysWhere({ workspaceId, taskId, commentId });
  },

  /** Подтверждённые вложения всего ресурса — для обзора админки. */
  async totalUsage(): Promise<{ usedBytes: number; filesCount: number }> {
    const result = await prisma.taskAttachment.aggregate({
      where: { status: 'ready' },
      _sum: { size: true },
      _count: { _all: true },
    });
    return { usedBytes: result._sum.size ?? 0, filesCount: result._count._all };
  },
};
