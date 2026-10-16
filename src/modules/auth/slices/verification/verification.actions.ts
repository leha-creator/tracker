'use server';

import { toActionError } from '@/shared/errors';
import type { ActionFailure } from '@/shared/types';

import { resendVerificationSchema } from './verification.schema';
import { resendVerificationEmail } from './verification.service';

/** Состояние формы повторной отправки: `sent` — письмо (если аккаунт есть) отправлено. */
export type ResendVerificationState =
  { ok: true; sent: true } | (ActionFailure & { values: { email: string } }) | null;

export async function resendVerificationAction(
  _prev: ResendVerificationState,
  formData: FormData,
): Promise<ResendVerificationState> {
  try {
    await resendVerificationEmail(resendVerificationSchema.parse(Object.fromEntries(formData)));
    return { ok: true, sent: true };
  } catch (error) {
    const email = formData.get('email');
    return {
      ...toActionError(error, { action: 'resendVerification' }),
      values: { email: typeof email === 'string' ? email : '' },
    };
  }
}
