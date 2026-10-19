'use server';

import { redirect } from 'next/navigation';

import { toActionError } from '@/shared/errors';
import type { FormState } from '@/shared/types';

import { userIdSchema } from '../user/user.schema';
import { startImpersonation, stopImpersonation } from './impersonation.service';

/** Вход от имени: после успеха — на главную под пользователем. */
export async function startImpersonationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await startImpersonation(userIdSchema.parse(Object.fromEntries(formData)));
  } catch (error) {
    return { ...toActionError(error, { action: 'startImpersonation' }), values: {} };
  }
  redirect('/');
}

/** Возврат к своей учётной записи — на карточку пользователя в админке. */
export async function stopImpersonationAction(): Promise<FormState> {
  let userId: string;
  try {
    ({ userId } = await stopImpersonation());
  } catch (error) {
    return { ...toActionError(error, { action: 'stopImpersonation' }), values: {} };
  }
  redirect(`/admin/users/${userId}`);
}
