'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type ActionResult, type FormState } from '@/shared/types';

import type { TagDto } from './tag.dto';
import {
  createTagSchema,
  deleteTagSchema,
  setDocumentTagsSchema,
  updateTagSchema,
} from './tag.schema';
import { createTag, deleteTag, setDocumentTags, updateTag } from './tag.service';

function revalidateDocuments() {
  revalidatePath('/w/[workspaceSlug]/docs', 'layout');
}

export async function createTagAction(
  _prev: FormState<TagDto>,
  formData: FormData,
): Promise<FormState<TagDto>> {
  try {
    const input = createTagSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const tag = await createTag(session, input);
    revalidateDocuments();
    return { ok: true, data: tag };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createTag' }),
      values: formValues(formData, ['name', 'color']),
    };
  }
}

export async function updateTagAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = updateTagSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await updateTag(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'updateTag' }),
      values: formValues(formData, ['name', 'color']),
    };
  }
}

export async function deleteTagAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = deleteTagSchema.parse(raw);
    const session = await requireUser();
    await deleteTag(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'deleteTag' });
  }
}

export async function setDocumentTagsAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = setDocumentTagsSchema.parse(raw);
    const session = await requireUser();
    await setDocumentTags(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, { action: 'setDocumentTags' });
  }
}
