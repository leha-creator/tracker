import { z } from 'zod';

import type { NotificationType } from './notification-type';

/** Длина фрагмента комментария в уведомлении и письме. */
export const NOTIFICATION_EXCERPT_LENGTH = 140;

const workspaceRef = {
  workspaceSlug: z.string().min(1),
  workspaceName: z.string(),
  /** Имя автора действия на момент события; null — неизвестен. */
  actorName: z.string().nullable(),
  /** Уведомление адресовано агенту пространства и перенаправлено человеку (ответственному). */
  forAgent: z.object({ name: z.string() }).optional(),
};

const taskRef = {
  ...workspaceRef,
  taskNumber: z.number().int().positive(),
  taskTitle: z.string(),
  /** Ключ для текста (`TSK-42`). Нет в уведомлениях до появления ключей — тогда `#номер`. */
  taskKey: z.string().min(1).optional(),
};

const commentRef = { ...taskRef, commentExcerpt: z.string() };

/** Смена статуса задачи в проекте: имена — снимок на момент события. */
const statusChangeRef = {
  ...taskRef,
  projectName: z.string(),
  fromStatus: z.string(),
  toStatus: z.string(),
};

/** Срок задачи (`YYYY-MM-DD`) — снимок значения, о котором напоминание. */
const dueDateRef = {
  ...taskRef,
  dueDate: z.iso.date(),
};

/** PR GitHub, привязанный к задаче: ссылка ведёт на задачу, адрес PR — для письма. */
const pullRequestRef = {
  ...taskRef,
  repositoryFullName: z.string(),
  pullRequestNumber: z.number().int().positive(),
  pullRequestTitle: z.string(),
  pullRequestUrl: z.string(),
};

/**
 * Снимок данных события по типу: notifications не читает таблицы задач и пространств, поэтому
 * всё нужное для текста и ссылки сохраняется вместе с уведомлением.
 */
export const NOTIFICATION_PAYLOAD_SCHEMAS = {
  mention: z.object(commentRef),
  task_assigned: z.object(taskRef),
  task_comment: z.object(commentRef),
  workspace_invitation: z.object(workspaceRef),
  pr_linked: z.object(pullRequestRef),
  pr_merged: z.object(pullRequestRef),
  pr_review: z.object({
    ...pullRequestRef,
    reviewState: z.enum(['approved', 'changes_requested']),
  }),
  task_status_changed: z.object(statusChangeRef),
  task_due_soon: z.object(dueDateRef),
  task_overdue: z.object(dueDateRef),
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
    case 'pr_linked':
    case 'pr_merged':
    case 'pr_review':
    case 'task_status_changed':
    case 'task_due_soon':
    case 'task_overdue':
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
  const text = baseNotificationText(notification);
  const agent = notification.payload.forAgent;
  return agent ? { ...text, title: `${text.title} (для агента ${agent.name})` } : text;
}

function baseNotificationText(notification: TypedNotification): NotificationText {
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
    case 'pr_linked':
      return {
        title: `PR ${pullRequestName(notification.payload)} привязан к задаче`,
        subject: taskSubject(notification.payload),
        excerpt: notification.payload.pullRequestTitle || null,
      };
    case 'pr_merged':
      return {
        title: `PR ${pullRequestName(notification.payload)} слит`,
        subject: taskSubject(notification.payload),
        excerpt: notification.payload.pullRequestTitle || null,
      };
    case 'pr_review':
      return {
        title:
          notification.payload.reviewState === 'approved'
            ? `PR ${pullRequestName(notification.payload)} одобрен`
            : `В PR ${pullRequestName(notification.payload)} запросили изменения`,
        subject: taskSubject(notification.payload),
        excerpt: notification.payload.pullRequestTitle || null,
      };
    case 'task_status_changed':
      return {
        title: `Статус: ${notification.payload.fromStatus} → ${notification.payload.toStatus}`,
        subject: taskSubject(notification.payload),
        excerpt: `Проект «${notification.payload.projectName}»`,
      };
    case 'task_due_soon':
      return {
        title: 'Завтра срок задачи',
        subject: taskSubject(notification.payload),
        excerpt: `Срок: ${formatDueDate(notification.payload.dueDate)}`,
      };
    case 'task_overdue':
      return {
        title: 'Срок задачи прошёл',
        subject: taskSubject(notification.payload),
        excerpt: `Срок был ${formatDueDate(notification.payload.dueDate)}`,
      };
  }
}

const DUE_DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10-18` → «18 октября 2026 г.»: дата без времени — в UTC, без сдвига суток. */
function formatDueDate(isoDate: string): string {
  return DUE_DATE_FORMAT.format(new Date(`${isoDate}T00:00:00.000Z`));
}

function pullRequestName(payload: { repositoryFullName: string; pullRequestNumber: number }) {
  return `${payload.repositoryFullName}#${payload.pullRequestNumber}`;
}

function taskSubject(payload: { taskNumber: number; taskTitle: string; taskKey?: string }): string {
  return `${payload.taskKey ?? `#${payload.taskNumber}`} ${payload.taskTitle}`;
}
