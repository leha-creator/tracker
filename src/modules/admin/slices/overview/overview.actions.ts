'use server';

import { toActionError } from '@/shared/errors';
import type { FormState } from '@/shared/types';

import { sendTestMail } from './overview.service';

export async function sendTestMailAction(
  _prev: FormState<{ to: string }>,
): Promise<FormState<{ to: string }>> {
  try {
    return { ok: true, data: await sendTestMail() };
  } catch (error) {
    return { ...toActionError(error, { action: 'sendTestMail' }), values: {} };
  }
}
