'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import type { NotificationPageDto } from './notification.dto';
import { listNotificationsSchema, markNotificationReadSchema } from './notification.schema';
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notification.service';

// Счётчик в шапке клиент обновляет сам — layout не перерисовываем на каждый клик.
function revalidateNotificationsPage() {
  revalidatePath('/notifications');
}

export async function markNotificationReadAction(raw: {
  notificationId: string;
}): Promise<ActionResult<null>> {
  try {
    const { notificationId } = markNotificationReadSchema.parse(raw);
    const session = await requireUser();
    await markNotificationRead(session, notificationId);
    revalidateNotificationsPage();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'markNotificationRead' });
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireUser();
    const count = await markAllNotificationsRead(session);
    revalidateNotificationsPage();
    return { ok: true, data: { count } };
  } catch (error) {
    return toActionError(error, { action: 'markAllNotificationsRead' });
  }
}

/** «Показать ещё» на странице уведомлений. */
export async function loadMoreNotificationsAction(raw: {
  cursor: string;
  unreadOnly: boolean;
}): Promise<ActionResult<NotificationPageDto>> {
  try {
    const input = listNotificationsSchema.parse(raw);
    const session = await requireUser();
    const data = await listMyNotifications(session, input);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, { action: 'loadMoreNotifications' });
  }
}
