import 'server-only';

import { after } from 'next/server';

import type { AuthSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { sendMail } from '@/shared/mail';

import {
  buildNotificationHref,
  dedupeRecipients,
  formatNotificationText,
  parseNotificationPayload,
  resolveChannels,
  type NotificationEvent,
  type TypedNotification,
} from '../../models';
import { preferenceRepository } from '../preference/preference.repository';
import type { NotificationDto, NotificationPageDto } from './notification.dto';
import { buildNotificationMail } from './notification.mail';
import {
  notificationRepository,
  type NewNotificationRow,
  type NotificationCursor,
  type NotificationRow,
} from './notification.repository';
import { encodeNotificationCursor, NOTIFICATIONS_PAGE_SIZE } from './notification.schema';

const log = createLogger('notifications');

/** Настройки уведомлений в профиле — ссылка в письмах. */
const SETTINGS_PATH = '/profile/notifications';

interface MailJob {
  to: string;
  recipientId: string;
  event: NotificationEvent;
}

function toTyped(event: NotificationEvent): TypedNotification {
  return {
    type: event.type,
    payload: event.payload,
    commentId: event.commentId ?? null,
    invitationId: event.invitationId ?? null,
  } as TypedNotification;
}

function toRow(event: NotificationEvent): NewNotificationRow {
  return {
    userId: event.recipientId,
    workspaceId: event.workspaceId,
    type: event.type,
    actorId: event.actorId,
    taskId: event.taskId ?? null,
    commentId: event.commentId ?? null,
    invitationId: event.invitationId ?? null,
    payload: event.payload,
  };
}

async function sendNotificationMails(jobs: readonly MailJob[]): Promise<void> {
  const baseUrl = getEnv().BETTER_AUTH_URL;
  const settingsUrl = new URL(SETTINGS_PATH, baseUrl).toString();
  const results = await Promise.allSettled(
    jobs.map(({ to, event }) => {
      const typed = toTyped(event);
      const mail = buildNotificationMail({
        text: formatNotificationText(typed),
        actorName: event.payload.actorName,
        workspaceName: event.payload.workspaceName,
        url: new URL(buildNotificationHref(typed), baseUrl).toString(),
        settingsUrl,
      });
      return sendMail({ to, ...mail });
    }),
  );
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;
    failed += 1;
    const { recipientId, event } = jobs[index]!;
    log.error(
      { err: result.reason, recipientId, type: event.type, workspaceId: event.workspaceId },
      '[notification.mail] send failed',
    );
  });
  log.debug({ total: jobs.length, failed }, '[notification.mail] batch done');
}

/** Письма — после ответа пользователю; вне запроса Next.js (скрипты) — сразу в фоне. */
function scheduleMails(jobs: MailJob[]): void {
  if (jobs.length === 0) return;
  const task = () => sendNotificationMails(jobs);
  try {
    after(task);
  } catch (error) {
    log.debug({ err: error }, '[notification.mail] after() unavailable, sending in background');
    void task();
  }
}

/**
 * Уведомления об одном действии. Для серверных модулей, которые уже проверили доступ автора
 * действия. Автор исключается, одному получателю — одно (важнейшее) уведомление, каналы — по
 * настройкам получателя. Никогда не бросает: сбой уведомлений не отменяет само действие.
 */
export async function notify(events: readonly NotificationEvent[]): Promise<void> {
  const unique = dedupeRecipients(events);
  if (unique.length === 0) {
    log.debug({ events: events.length }, '[notification.notify] no recipients');
    return;
  }
  const first = unique[0]!;
  const context = { workspaceId: first.workspaceId, taskId: first.taskId ?? null };

  try {
    const recipientIds = unique.map((event) => event.recipientId);
    const [preferences, recipients] = await Promise.all([
      preferenceRepository.listForUsers(recipientIds),
      notificationRepository.findRecipients(recipientIds),
    ]);
    const emails = new Map(recipients.map((user) => [user.id, user.email]));

    const rows: NewNotificationRow[] = [];
    const mails: MailJob[] = [];
    for (const event of unique) {
      const email = emails.get(event.recipientId);
      if (email === undefined) continue; // удалён или заблокирован
      const channels = resolveChannels(
        event.type,
        preferences.get(event.recipientId)?.get(event.type),
      );
      if (channels.inApp) rows.push(toRow(event));
      if (channels.email) mails.push({ to: email, recipientId: event.recipientId, event });
    }

    const created = await notificationRepository.createMany(rows);
    scheduleMails(mails);
    log.info(
      {
        ...context,
        types: [...new Set(unique.map((event) => event.type))],
        recipients: unique.length,
        inApp: created.length,
        email: mails.length,
      },
      '[notification] created',
    );
  } catch (error) {
    log.error({ ...context, err: error, events: events.length }, '[notification.notify] failed');
  }
}

/**
 * Уведомление по email (приглашение): если такого пользователя нет, ничего не делает.
 * Как и `notify`, никогда не бросает.
 */
export async function notifyByEmail(
  email: string,
  event: Omit<NotificationEvent, 'recipientId'>,
): Promise<void> {
  try {
    const recipientId = await notificationRepository.findUserIdByEmail(email);
    if (!recipientId) {
      log.debug({ type: event.type }, '[notification.notifyByEmail] no such user');
      return;
    }
    await notify([{ ...event, recipientId } as NotificationEvent]);
  } catch (error) {
    log.error({ err: error, type: event.type }, '[notification.notifyByEmail] failed');
  }
}

function toNotificationDto(row: NotificationRow): NotificationDto | null {
  const payload = parseNotificationPayload(row.type, row.payload);
  if (!payload) {
    log.warn({ notificationId: row.id, type: row.type }, '[notification] invalid payload');
    return null;
  }
  const typed = {
    type: row.type,
    payload,
    commentId: row.commentId,
    invitationId: row.invitationId,
  } as TypedNotification;
  const text = formatNotificationText(typed);
  return {
    id: row.id,
    type: row.type,
    title: text.title,
    subject: text.subject,
    excerpt: text.excerpt,
    href: buildNotificationHref(typed),
    actor: row.actor
      ? { userId: row.actor.id, name: row.actor.name, image: row.actor.image }
      : null,
    actorName: row.actor?.name ?? payload.actorName,
    workspaceName: payload.workspaceName,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/** Уведомления текущего пользователя от новых к старым, постранично по курсору. */
export async function listMyNotifications(
  session: AuthSession,
  options: { cursor?: NotificationCursor | null; unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationPageDto> {
  const userId = session.user.id;
  const limit = options.limit ?? NOTIFICATIONS_PAGE_SIZE;
  const unreadOnly = options.unreadOnly ?? false;
  const rows = await notificationRepository.list(userId, {
    cursor: options.cursor ?? null,
    unreadOnly,
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  log.debug({ userId, count: page.length, unreadOnly }, '[notification.list]');
  return {
    items: page.flatMap((row) => toNotificationDto(row) ?? []),
    nextCursor: rows.length > limit && last ? encodeNotificationCursor(last) : null,
  };
}

export async function countMyUnreadNotifications(session: AuthSession): Promise<number> {
  const count = await notificationRepository.countUnread(session.user.id);
  log.debug({ userId: session.user.id, count }, '[notification.countUnread]');
  return count;
}

export async function markNotificationRead(
  session: AuthSession,
  notificationId: string,
): Promise<void> {
  const userId = session.user.id;
  if (!(await notificationRepository.exists(userId, notificationId))) {
    log.warn({ userId, notificationId }, '[notification.markRead] not found');
    throw new NotFoundError('Уведомление не найдено');
  }
  const changed = await notificationRepository.markRead(userId, [notificationId]);
  log.info({ userId, notificationId, changed }, '[notification] read');
}

export async function markAllNotificationsRead(session: AuthSession): Promise<number> {
  const userId = session.user.id;
  const count = await notificationRepository.markRead(userId);
  log.info({ userId, count }, '[notification] all read');
  return count;
}
