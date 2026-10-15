'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import {
  addStatusSchema,
  deleteStatusSchema,
  moveStatusSchema,
  updateStatusSchema,
} from './status.schema';
import { addStatus, deleteStatus, moveStatus, updateStatus } from './status.service';

const STATUS_FIELDS = ['name', 'category', 'color'] as const;

/** Колонки доски и настройки проекта — под layout пространства. */
function revalidateWorkspace() {
  revalidatePath('/w/[workspaceSlug]', 'layout');
}

export async function addStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = addStatusSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await addStatus(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'addStatus' }),
      values: formValues(formData, STATUS_FIELDS),
    };
  }
}

export async function updateStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = updateStatusSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateStatus(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateStatus' }),
      values: formValues(formData, STATUS_FIELDS),
    };
  }
}

export async function moveStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = moveStatusSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await moveStatus(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'moveStatus' }), values: {} };
  }
}

export async function deleteStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = deleteStatusSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await deleteStatus(session, input);
    revalidateWorkspace();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteStatus' }), values: {} };
  }
}
