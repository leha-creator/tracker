'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import type { ActionResult } from '@/shared/types';

import type { NotificationChannels } from '../../models';
import { updateNotificationPreferenceSchema } from './preference.schema';
import { updateNotificationPreference } from './preference.service';

/** Переключатель в настройках профиля: сохраняется сразу, без кнопки «Сохранить». */
export async function updateNotificationPreferenceAction(raw: {
  type: string;
  channel: string;
  enabled: boolean;
}): Promise<ActionResult<NotificationChannels>> {
  try {
    const input = updateNotificationPreferenceSchema.parse(raw);
    const session = await requireUser();
    const data = await updateNotificationPreference(session, input);
    revalidatePath('/profile', 'layout');
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, { action: 'updateNotificationPreference' });
  }
}
