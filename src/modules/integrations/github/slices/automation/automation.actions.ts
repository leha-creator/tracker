'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { updateProjectAutomationSchema } from './automation.schema';
import { updateProjectAutomation } from './automation.service';

export async function updateProjectAutomationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = updateProjectAutomationSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateProjectAutomation(session, input);
    revalidatePath('/w/[workspaceSlug]/projects/[projectId]/settings', 'page');
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateProjectAutomation' }),
      values: formValues(formData, ['prOpenedStatusId', 'prMergedStatusId']),
    };
  }
}
