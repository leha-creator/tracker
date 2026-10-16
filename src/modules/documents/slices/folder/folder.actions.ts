'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import type { DocumentFolderDto, FolderDeletedDto } from './folder.dto';
import {
  createFolderSchema,
  deleteFolderSchema,
  moveFolderSchema,
  renameFolderSchema,
} from './folder.schema';
import { createFolder, deleteFolder, moveFolder, renameFolder } from './folder.service';

/** Дерево папок — в layout раздела «Документы», оно же у страниц документов. */
function revalidateDocuments() {
  revalidatePath('/w/[workspaceSlug]/docs', 'layout');
}

export async function createFolderAction(
  _prev: FormState<DocumentFolderDto>,
  formData: FormData,
): Promise<FormState<DocumentFolderDto>> {
  try {
    const input = createFolderSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const folder = await createFolder(session, input);
    revalidateDocuments();
    return { ok: true, data: folder };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'createFolder' }),
      values: formValues(formData, ['name']),
    };
  }
}

export async function renameFolderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = renameFolderSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await renameFolder(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'renameFolder' }),
      values: formValues(formData, ['name']),
    };
  }
}

export async function moveFolderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = moveFolderSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    await moveFolder(session, input);
    revalidateDocuments();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'moveFolder' }),
      values: formValues(formData, ['targetId']),
    };
  }
}

export async function deleteFolderAction(
  _prev: FormState<FolderDeletedDto>,
  formData: FormData,
): Promise<FormState<FolderDeletedDto>> {
  try {
    const input = deleteFolderSchema.parse(Object.fromEntries(formData));
    const session = await requireUser();
    const result = await deleteFolder(session, input);
    revalidateDocuments();
    return { ok: true, data: result };
  } catch (error) {
    return { ...toActionError(error, { action: 'deleteFolder' }), values: {} };
  }
}
