'use server';

import { revalidatePath } from 'next/cache';

import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { updateSignupPolicySchema, updateStorageSettingsSchema } from './settings.schema';
import { updateSignupPolicy, updateStorageSettings } from './settings.service';

export async function updateSignupPolicyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateSignupPolicy(updateSignupPolicySchema.parse(Object.fromEntries(formData)));
    revalidatePath('/admin/settings');
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateSignupPolicy' }),
      values: formValues(formData, ['signupMode', 'allowedEmailDomains']),
    };
  }
}

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
