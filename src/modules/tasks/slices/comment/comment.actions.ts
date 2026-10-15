'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { createCommentSchema, deleteCommentSchema, updateCommentSchema } from './comment.schema';
import { createComment, deleteComment, updateComment } from './comment.service';

/** Комментарии видны только на странице задачи. */
function revalidateTaskPage() {
  revalidatePath('/w/[workspaceSlug]/tasks/[taskNumber]', 'page');
}

export async function createCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = createCommentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await createComment(session, input);
    revalidateTaskPage();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createComment' }),
      values: formValues(formData, ['body']),
    };
  }
}

export async function updateCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = updateCommentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateComment(session, input);
    revalidateTaskPage();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateComment' }),
      values: formValues(formData, ['body']),
    };
  }
}

export async function deleteCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const input = deleteCommentSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await deleteComment(session, input);
    revalidateTaskPage();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteComment' }), values: {} };
  }
}
