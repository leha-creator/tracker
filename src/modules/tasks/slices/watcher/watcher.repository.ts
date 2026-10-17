import 'server-only';

import { prisma, type TransactionClient } from '@/shared/db';

// Все запросы — с workspaceId в where: подписки чужого пространства не видны (защита от IDOR).
export const watcherRepository = {
  /** Пользователи, которых можно подписать: существующие и не агенты. */
  async filterWatchable(db: TransactionClient, userIds: string[]): Promise<string[]> {
    const rows = await db.user.findMany({
      where: { id: { in: userIds }, isAgent: false },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },

  /** Подписывает пользователей; уже подписанные пропускаются. Возвращает число новых. */
  async addMany(
    db: TransactionClient,
    workspaceId: string,
    taskId: string,
    userIds: string[],
  ): Promise<number> {
    const { count } = await db.taskWatcher.createMany({
      data: userIds.map((userId) => ({ taskId, userId, workspaceId })),
      skipDuplicates: true,
    });
    return count;
  },

  async remove(workspaceId: string, taskId: string, userId: string): Promise<number> {
    const { count } = await prisma.taskWatcher.deleteMany({
      where: { workspaceId, taskId, userId },
    });
    return count;
  },

  listForTask(workspaceId: string, taskId: string) {
    return prisma.taskWatcher.findMany({
      where: { workspaceId, taskId },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { id: true, name: true, image: true } } },
    });
  },

  /** id наблюдателей — для уведомлений. */
  async listUserIds(workspaceId: string, taskId: string): Promise<string[]> {
    const rows = await prisma.taskWatcher.findMany({
      where: { workspaceId, taskId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  },

  /** Поля задачи для текста уведомления. */
  findTaskRef(workspaceId: string, taskId: string) {
    return prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: {
        number: true,
        title: true,
        workspace: { select: { slug: true, name: true, taskKey: true } },
      },
    });
  },

  async taskExists(workspaceId: string, taskId: string): Promise<boolean> {
    const row = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    return row !== null;
  },
};
