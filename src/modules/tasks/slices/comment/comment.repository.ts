import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import { COMMENT_ATTACHMENTS_SELECT } from '../attachment/attachment.select';

const COMMENT_SELECT = {
  id: true,
  body: true,
  authorId: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, name: true, image: true } },
  attachments: COMMENT_ATTACHMENTS_SELECT,
} as const satisfies Prisma.TaskCommentSelect;

interface CommentKey {
  workspaceId: string;
  taskId: string;
  commentId: string;
}

function whereKey({ workspaceId, taskId, commentId }: CommentKey) {
  return { id: commentId, taskId, workspaceId } satisfies Prisma.TaskCommentWhereInput;
}

// Все запросы — с workspaceId и taskId в where: комментарий чужой задачи или пространства
// не находится (защита от IDOR).
export const commentRepository = {
  /**
   * Задача пространства с данными для уведомлений (номер, название, ответственный, автор,
   * пространство); null — задачи нет.
   */
  findTask(workspaceId: string, taskId: string) {
    return prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        number: true,
        title: true,
        assigneeId: true,
        createdById: true,
        workspace: { select: { slug: true, name: true, taskKey: true } },
      },
    });
  },

  /**
   * Последние `take` комментариев задачи (без `take` — все), от новых к старым,
   * и общее число — согласованно, одной транзакцией.
   */
  async listForTask(workspaceId: string, taskId: string, take?: number) {
    const where = { workspaceId, taskId } satisfies Prisma.TaskCommentWhereInput;
    const [total, rows] = await prisma.$transaction([
      prisma.taskComment.count({ where }),
      prisma.taskComment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: COMMENT_SELECT,
      }),
    ]);
    return { total, rows };
  },

  find(key: CommentKey) {
    return prisma.taskComment.findFirst({ where: whereKey(key), select: COMMENT_SELECT });
  },

  create(
    data: { workspaceId: string; taskId: string; authorId: string; body: string },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.taskComment.create({ data, select: { id: true } });
  },

  /** Новый текст и отметка правки; возвращает число изменённых строк (0 — не найден). */
  async updateBody(key: CommentKey, body: string): Promise<number> {
    const { count } = await prisma.taskComment.updateMany({
      where: whereKey(key),
      data: { body, editedAt: new Date() },
    });
    return count;
  },

  /** Возвращает число удалённых строк (0 — не найден). */
  async delete(key: CommentKey): Promise<number> {
    const { count } = await prisma.taskComment.deleteMany({ where: whereKey(key) });
    return count;
  },
};

export type CommentTaskRow = NonNullable<Awaited<ReturnType<typeof commentRepository.findTask>>>;
export type CommentRow = NonNullable<Awaited<ReturnType<typeof commentRepository.find>>>;
