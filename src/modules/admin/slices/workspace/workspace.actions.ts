'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import {
  deleteWorkspaceSchema,
  setStorageQuotaSchema,
  transferOwnershipSchema,
  workspaceIdSchema,
} from './workspace.schema';
import {
  archiveWorkspaceByAdmin,
  deleteWorkspaceByAdmin,
  restoreWorkspaceByAdmin,
  setStorageQuotaByAdmin,
  transferOwnershipByAdmin,
} from './workspace.service';

/** Пространство видно и в админке, и у участников: обновляем всё приложение. */
function revalidateWorkspaces() {
  revalidatePath('/', 'layout');
}

export async function archiveWorkspaceByAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await archiveWorkspaceByAdmin(workspaceIdSchema.parse(Object.fromEntries(formData)));
    revalidateWorkspaces();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'archiveWorkspaceByAdmin' }), values: {} };
  }
}

export async function restoreWorkspaceByAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await restoreWorkspaceByAdmin(workspaceIdSchema.parse(Object.fromEntries(formData)));
    revalidateWorkspaces();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'restoreWorkspaceByAdmin' }), values: {} };
  }
}

/** После удаления карточки нет — переход к списку. */
export async function deleteWorkspaceByAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await deleteWorkspaceByAdmin(deleteWorkspaceSchema.parse(Object.fromEntries(formData)));
    revalidateWorkspaces();
  } catch (error) {
    return {
      ...toActionError(error, { action: 'deleteWorkspaceByAdmin' }),
      values: formValues(formData, ['confirmName']),
    };
  }
  redirect('/admin/workspaces');
}

export async function transferOwnershipByAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await transferOwnershipByAdmin(transferOwnershipSchema.parse(Object.fromEntries(formData)));
    revalidateWorkspaces();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'transferOwnershipByAdmin' }), values: {} };
  }
}

export async function setStorageQuotaByAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await setStorageQuotaByAdmin(setStorageQuotaSchema.parse(Object.fromEntries(formData)));
    revalidateWorkspaces();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'setStorageQuotaByAdmin' }),
      values: formValues(formData, ['quotaMb']),
    };
  }
}
