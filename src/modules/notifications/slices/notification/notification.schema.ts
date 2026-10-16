import { z } from 'zod';

/** Сколько уведомлений в выпадающем списке колокольчика. */
export const NOTIFICATIONS_MENU_SIZE = 10;
/** Размер страницы `/notifications`. */
export const NOTIFICATIONS_PAGE_SIZE = 30;
const NOTIFICATIONS_MAX_LIMIT = 50;

/** Курсор страницы: `<ISO-время>_<id>` последнего показанного уведомления. */
export const notificationCursorSchema = z.string().transform((value, ctx) => {
  const index = value.lastIndexOf('_');
  const createdAt = new Date(value.slice(0, index));
  const id = value.slice(index + 1);
  if (index <= 0 || Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success) {
    ctx.addIssue({ code: 'custom', message: 'Некорректный курсор' });
    return z.NEVER;
  }
  return { createdAt, id };
});

export function encodeNotificationCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

export const listNotificationsSchema = z.object({
  cursor: notificationCursorSchema.nullish(),
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(NOTIFICATIONS_MAX_LIMIT).default(NOTIFICATIONS_PAGE_SIZE),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.uuid({ error: 'Некорректный идентификатор' }),
});
