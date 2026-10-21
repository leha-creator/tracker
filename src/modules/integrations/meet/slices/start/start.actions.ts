'use server';

import { headers } from 'next/headers';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { getClientIp } from '@/shared/rate-limit';
import type { ActionResult } from '@/shared/types';

import { startTaskMeetingSchema } from './start.schema';
import { startTaskMeeting } from './start.service';

/** «Начать созвон»: адрес meet с подписанным контекстом задачи — браузер откроет его в новой вкладке. */
export async function startTaskMeetingAction(raw: unknown): Promise<ActionResult<{ url: string }>> {
  try {
    const input = startTaskMeetingSchema.parse(raw);
    const session = await requireUser();
    const ip = getClientIp(await headers());
    return { ok: true, data: await startTaskMeeting(session, { ...input, ip }) };
  } catch (error) {
    return toActionError(error, { action: 'startTaskMeeting' });
  }
}
