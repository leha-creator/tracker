import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import type { AgentRoute, NotificationType } from '../../models';

const NOTIFICATION_SELECT = {
  id: true,
  workspaceId: true,
  type: true,
  taskId: true,
  commentId: true,
  invitationId: true,
  payload: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, name: true, image: true } },
} as const satisfies Prisma.NotificationSelect;

export type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

export interface NewNotificationRow {
  userId: string;
  workspaceId: string;
  type: NotificationType;
  actorId: string | null;
  taskId: string | null;
  commentId: string | null;
  invitationId: string | null;
  payload: Prisma.InputJsonValue;
}

// Все чтения и изменения — с userId получателя в where: чужое уведомление не находится.
export const notificationRepository = {
  async createMany(rows: readonly NewNotificationRow[]): Promise<{ id: string; userId: string }[]> {
    if (rows.length === 0) return [];
    return prisma.notification.createManyAndReturn({
      data: [...rows],
      select: { id: true, userId: true },
    });
  },

  /** Страница уведомлений от новых к старым; `take + 1` — чтобы понять, есть ли следующая. */
  list(
    userId: string,
    options: { cursor: NotificationCursor | null; unreadOnly: boolean; take: number },
  ): Promise<NotificationRow[]> {
    const { cursor, unreadOnly, take } = options;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly && { readAt: null }),
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }),
    };
    return prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: NOTIFICATION_SELECT,
    });
  },

  countUnread(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  async exists(userId: string, id: string): Promise<boolean> {
    const count = await prisma.notification.count({ where: { id, userId } });
    return count > 0;
  },

  /** Отмечает прочитанными; уже прочитанные не трогает. Возвращает число изменённых. */
  async markRead(userId: string, ids?: readonly string[]): Promise<number> {
    const { count } = await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && { id: { in: [...ids] } }) },
      data: { readAt: new Date() },
    });
    return count;
  },

  /** Получатели: email и имя для писем; заблокированные не получают ничего. */
  /**
   * Включённые агенты пространства среди получателей: ответственный (если ещё участник) и
   * владельцы-люди. Задокументированное чтение таблиц модулей agents и workspaces — как чтение
   * User для email: notifications ни от кого не зависит.
   */
  async findAgentRoutes(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, AgentRoute>> {
    const agents = await prisma.workspaceAgent.findMany({
      where: { workspaceId, userId: { in: [...userIds] }, disabledAt: null },
      select: {
        userId: true,
        user: { select: { name: true } },
        responsible: {
          select: {
            id: true,
            workspaceMemberships: { where: { workspaceId }, select: { id: true } },
          },
        },
      },
    });
    if (agents.length === 0) return new Map();
    const owners = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: 'owner', user: { isAgent: false } },
      select: { userId: true },
    });
    const ownerIds = owners.map((owner) => owner.userId);
    return new Map(
      agents.map((agent) => [
        agent.userId,
        {
          agentId: agent.userId,
          name: agent.user.name,
          workspaceId,
          responsibleUserId:
            agent.responsible && agent.responsible.workspaceMemberships.length > 0
              ? agent.responsible.id
              : null,
          ownerIds,
        },
      ]),
    );
  },

  /** Получатели-люди: агенты сами уведомления не читают (их перенаправляет findAgentRoutes). */
  findRecipients(userIds: readonly string[]) {
    return prisma.user.findMany({
      where: {
        id: { in: [...userIds] },
        isAgent: false,
        OR: [{ banned: false }, { banned: null }],
      },
      select: { id: true, email: true, name: true },
    });
  },

  async findUserIdByEmail(email: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return user?.id ?? null;
  },
};
