'use server';

import { revalidatePath } from 'next/cache';

import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { updateStorageSettingsSchema } from './settings.schema';
import { updateStorageSettings } from './settings.service';

export async function updateStorageSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateStorageSettings(updateStorageSettingsSchema.parse(Object.fromEntries(formData)));
    revalidatePath('/admin/settings');
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateStorageSettings' }),
      values: formValues(formData, ['defaultWorkspaceQuotaMb']),
    };
  }
}
