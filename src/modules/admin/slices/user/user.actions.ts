'use server';

import { revalidatePath } from 'next/cache';

import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { banUserSchema, deleteUserSchema, setUserRoleSchema, userIdSchema } from './user.schema';
import { banUser, deleteUser, revokeUserSessions, setUserRole, unbanUser } from './user.service';

/** Действия меняют только данные админки. */
function revalidateAdmin() {
  revalidatePath('/admin', 'layout');
}

export async function banUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await banUser(banUserSchema.parse(Object.fromEntries(formData)));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'banUser' }),
      values: formValues(formData, ['reason', 'duration']),
    };
  }
}

export async function unbanUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await unbanUser(userIdSchema.parse(Object.fromEntries(formData)));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'unbanUser' }), values: {} };
  }
}

export async function setUserRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await setUserRole(setUserRoleSchema.parse(Object.fromEntries(formData)));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'setUserRole' }), values: {} };
  }
}

export async function revokeUserSessionsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await revokeUserSessions(userIdSchema.parse(Object.fromEntries(formData)));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'revokeUserSessions' }), values: {} };
  }
}

export async function deleteUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await deleteUser(deleteUserSchema.parse(Object.fromEntries(formData)));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return {
      ...toActionError(error, { action: 'deleteUser' }),
      values: formValues(formData, ['confirmEmail']),
    };
  }
}
