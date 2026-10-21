'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { updateProfileSchema } from './profile.schema';
import { updateProfile } from './profile.service';

/** Должность видна в карточках участников по всему приложению — перерисовываем всё. */
function revalidateApp() {
  revalidatePath('/', 'layout');
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = updateProfileSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateProfile(session, input);
    revalidateApp();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateProfile' }),
      values: formValues(formData, ['position', 'bio']),
    };
  }
}
