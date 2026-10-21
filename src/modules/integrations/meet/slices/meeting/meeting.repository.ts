import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma, type TransactionClient } from '@/shared/db';

import type { StoredActionItem } from '../../models';

/** Поручения как JSON-колонка: у интерфейса нет индексной сигнатуры InputJsonValue. */
function toJson(items: readonly StoredActionItem[]): Prisma.InputJsonValue {
  return items.map((item) => ({ ...item }));
}

const TASK_SELECT = {
  id: true,
  number: true,
  title: true,
  archivedAt: true,
  assigneeId: true,
  workspace: { select: { id: true, slug: true, name: true, taskKey: true, archivedAt: true } },
} as const;

const MEETING_SELECT = {
  id: true,
  workspaceId: true,
  taskId: true,
  code: true,
  url: true,
  hostUserId: true,
  startedAt: true,
  endedAt: true,
  hostUser: { select: { id: true, name: true, image: true } },
  recaps: {
    orderBy: { completedAt: 'asc' },
    select: {
      id: true,
      documentId: true,
      actionItems: true,
      completedAt: true,
      document: { select: { title: true } },
    },
  },
} as const satisfies Prisma.TaskMeetingSelect;

export type MeetingTaskRow = NonNullable<Awaited<ReturnType<typeof meetingRepository.findTask>>>;
export type MeetingRow = Awaited<ReturnType<typeof meetingRepository.listTaskMeetings>>[number];

export const meetingRepository = {
  /** Задача с пространством — для контекста созвона и текста заметки. */
  findTask(workspaceId: string, taskId: string, db: TransactionClient = prisma) {
    return db.task.findFirst({ where: { id: taskId, workspaceId }, select: TASK_SELECT });
  },

  listTaskMeetings(workspaceId: string, taskId: string) {
    return prisma.taskMeeting.findMany({
      where: { workspaceId, taskId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: MEETING_SELECT,
    });
  },

  /** Номера задач пространства по id — ссылки на подзадачи из поручений. */
  findTaskNumbers(workspaceId: string, ids: readonly string[]) {
    return prisma.task.findMany({
      where: { workspaceId, id: { in: [...ids] } },
      select: { id: true, number: true },
    });
  },

  findByMeetId(meetMeetingId: string, db: TransactionClient = prisma) {
    return db.taskMeeting.findUnique({
      where: { meetMeetingId },
      select: { id: true, workspaceId: true, taskId: true, url: true, hostUserId: true },
    });
  },

  /**
   * Встреча по meeting.created: повтор того же события или того же jti не создаёт вторую строку.
   * Возвращает строку и признак «создана сейчас».
   */
  async upsertMeeting(
    tx: TransactionClient,
    data: {
      workspaceId: string;
      taskId: string;
      meetMeetingId: string;
      code: string;
      url: string;
      hostUserId: string;
      contextJti: string;
      startedAt: Date;
    },
  ): Promise<{ id: string; created: boolean }> {
    const existing = await tx.taskMeeting.findFirst({
      where: { OR: [{ meetMeetingId: data.meetMeetingId }, { contextJti: data.contextJti }] },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const row = await tx.taskMeeting.create({ data, select: { id: true } });
    return { id: row.id, created: true };
  },

  async markEnded(tx: TransactionClient, meetMeetingId: string, endedAt: Date): Promise<number> {
    const { count } = await tx.taskMeeting.updateMany({
      where: { meetMeetingId, endedAt: null },
      data: { endedAt },
    });
    return count;
  },

  findRecapByMeetId(tx: TransactionClient, meetRecapId: string) {
    return tx.taskMeetingRecap.findUnique({ where: { meetRecapId }, select: { id: true } });
  },

  createRecap(
    tx: TransactionClient,
    data: {
      meetingId: string;
      meetRecapId: string;
      documentId: string | null;
      actionItems: readonly StoredActionItem[];
      completedAt: Date;
    },
  ) {
    return tx.taskMeetingRecap.create({
      data: { ...data, actionItems: toJson(data.actionItems) },
      select: { id: true },
    });
  },

  /** Конспект с встречей под блокировкой строки — для создания подзадач без гонки. */
  async lockRecap(tx: TransactionClient, recapId: string) {
    await tx.$queryRaw`SELECT 1 FROM "TaskMeetingRecap" WHERE id = ${recapId}::uuid FOR UPDATE`;
    return tx.taskMeetingRecap.findUnique({
      where: { id: recapId },
      select: {
        id: true,
        actionItems: true,
        completedAt: true,
        meeting: { select: { workspaceId: true, taskId: true } },
      },
    });
  },

  async saveActionItems(
    tx: TransactionClient,
    recapId: string,
    actionItems: readonly StoredActionItem[],
  ): Promise<void> {
    await tx.taskMeetingRecap.update({
      where: { id: recapId },
      data: { actionItems: toJson(actionItems) },
    });
  },

  // ── Доставки вебхуков ──

  /** Запоминает доставку; повтор — P2002 (isUniqueViolation). */
  async recordDelivery(id: string, event: string): Promise<void> {
    await prisma.meetWebhookDelivery.create({ data: { id, event } });
  },

  /** Обработка упала — meet повторит доставку. */
  async forgetDelivery(id: string): Promise<void> {
    await prisma.meetWebhookDelivery.deleteMany({ where: { id } });
  },

  async purgeDeliveriesBefore(before: Date): Promise<number> {
    const { count } = await prisma.meetWebhookDelivery.deleteMany({
      where: { receivedAt: { lt: before } },
    });
    return count;
  },
};
