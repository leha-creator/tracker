import { z } from 'zod';

import type { NotificationType } from './notification-type';

/** Длина фрагмента комментария в уведомлении и письме. */
export const NOTIFICATION_EXCERPT_LENGTH = 140;

const workspaceRef = {
  workspaceSlug: z.string().min(1),
  workspaceName: z.string(),
  /** Имя автора действия на момент события; null — неизвестен. */
  actorName: z.string().nullable(),
};

const taskRef = {
  ...workspaceRef,
  taskNumber: z.number().int().positive(),
  taskTitle: z.string(),
};

const commentRef = { ...taskRef, commentExcerpt: z.string() };

/**
 * Снимок данных события по типу: notifications не читает таблицы задач и пространств, поэтому
 * всё нужное для текста и ссылки сохраняется вместе с уведомлением.
 */
export const NOTIFICATION_PAYLOAD_SCHEMAS = {
  mention: z.object(commentRef),
  task_assigned: z.object(taskRef),
  task_comment: z.object(commentRef),
  workspace_invitation: z.object(workspaceRef),
} satisfies Record<NotificationType, z.ZodType>;

export type NotificationPayloadMap = {
  [T in NotificationType]: z.infer<(typeof NOTIFICATION_PAYLOAD_SCHEMAS)[T]>;
};

export type NotificationPayload<T extends NotificationType = NotificationType> =
  NotificationPayloadMap[T];

/** Уведомление с проверенным payload: тип и данные согласованы. */
export type TypedNotification = {
  [T in NotificationType]: {
    type: T;
    payload: NotificationPayloadMap[T];
    commentId: string | null;
    invitationId: string | null;
  };
}[NotificationType];

/** Проверяет payload из БД. Несогласованные данные (старая схема, ручная правка) — null. */
export function parseNotificationPayload<T extends NotificationType>(
  type: T,
  raw: unknown,
): NotificationPayloadMap[T] | null {
  const result = NOTIFICATION_PAYLOAD_SCHEMAS[type].safeParse(raw);
  return result.success ? (result.data as NotificationPayloadMap[T]) : null;
}

/** Фрагмент текста комментария: одна строка, не длиннее `NOTIFICATION_EXCERPT_LENGTH`. */
export function excerpt(text: string, max = NOTIFICATION_EXCERPT_LENGTH): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Адрес в приложении, куда ведёт уведомление. */
export function buildNotificationHref(notification: TypedNotification): string {
  switch (notification.type) {
    case 'workspace_invitation':
      return notification.invitationId
        ? `/invite/${notification.invitationId}`
        : `/w/${notification.payload.workspaceSlug}`;
    case 'task_assigned':
      return `/w/${notification.payload.workspaceSlug}/tasks/${notification.payload.taskNumber}`;
    case 'mention':
    case 'task_comment': {
      const base = `/w/${notification.payload.workspaceSlug}/tasks/${notification.payload.taskNumber}`;
      return notification.commentId ? `${base}#comment-${notification.commentId}` : base;
    }
  }
}

export interface NotificationText {
  /** Что произошло — без глагола в прошедшем времени, чтобы не зависеть от рода автора. */
  title: string;
  /** Где: задача или пространство. */
  subject: string;
  /** Фрагмент комментария; null — нет. */
  excerpt: string | null;
}

/** Текст уведомления для колокольчика, страницы и письма. */
export function formatNotificationText(notification: TypedNotification): NotificationText {
  switch (notification.type) {
    case 'mention':
      return {
        title: 'Упоминание в комментарии',
        subject: taskSubject(notification.payload),
        excerpt: notification.payload.commentExcerpt || null,
      };
    case 'task_comment':
      return {
        title: 'Новый комментарий к задаче',
        subject: taskSubject(notification.payload),
        excerpt: notification.payload.commentExcerpt || null,
      };
    case 'task_assigned':
      return {
        title: 'Вас назначили ответственным',
        subject: taskSubject(notification.payload),
        excerpt: null,
      };
    case 'workspace_invitation':
      return {
        title: 'Приглашение в пространство',
        subject: `«${notification.payload.workspaceName}»`,
        excerpt: null,
      };
  }
}

function taskSubject(payload: { taskNumber: number; taskTitle: string }): string {
  return `#${payload.taskNumber} ${payload.taskTitle}`;
}
