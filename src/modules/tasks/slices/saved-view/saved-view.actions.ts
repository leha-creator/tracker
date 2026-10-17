'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import type { SavedTaskViewDto } from './saved-view.dto';
import {
  createSavedViewSchema,
  deleteSavedViewSchema,
  renameSavedViewSchema,
} from './saved-view.schema';
import { createSavedView, deleteSavedView, renameSavedView } from './saved-view.service';

/** Фильтры видны в тулбаре списков: пространства и проекта (layout раздела) и «Моих задач». */
function revalidateLists() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
  revalidatePath('/my-tasks');
}

/** Диалог «Сохранить фильтр»: имя и текущие параметры списка из скрытых полей. */
export async function createSavedViewAction(
  _prev: FormState<SavedTaskViewDto>,
  formData: FormData,
): Promise<FormState<SavedTaskViewDto>> {
  try {
    const input = createSavedViewSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const view = await createSavedView(session, input);
    revalidateLists();
    return { ok: true, data: view };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createSavedView' }),
      values: formValues(formData, ['name']),
    };
  }
}

export async function renameSavedViewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = renameSavedViewSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await renameSavedView(session, input);
    revalidateLists();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'renameSavedView' }),
      values: formValues(formData, ['name']),
    };
  }
}

/** Удаление — из диалога подтверждения. */
export async function deleteSavedViewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = deleteSavedViewSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await deleteSavedView(session, input);
    revalidateLists();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteSavedView' }), values: {} };
  }
}
