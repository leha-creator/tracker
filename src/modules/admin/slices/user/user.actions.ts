'use server';

import { revalidatePath } from 'next/cache';

import { toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import {
  banUserSchema,
  deleteUserSchema,
  revokeUserSessionSchema,
  revokeUserTokenSchema,
  setUserRoleSchema,
  userIdSchema,
} from './user.schema';
import {
  banUser,
  deleteUser,
  resendVerificationEmail,
  resetUserTwoFactor,
  revokeUserApiToken,
  revokeUserSession,
  revokeUserSessions,
  sendPasswordResetEmail,
  setUserRole,
  unbanUser,
  verifyUserEmail,
} from './user.service';

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

export async function resetUserTwoFactorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await resetUserTwoFactor(userIdSchema.parse(Object.fromEntries(formData)));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action: 'resetUserTwoFactor' }), values: {} };
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

/** Действие карточки без полей формы: только id пользователя (и объекта) в скрытых полях. */
async function runSimple(
  action: string,
  formData: FormData,
  run: (input: Record<string, FormDataEntryValue>) => Promise<void>,
): Promise<FormState> {
  try {
    await run(Object.fromEntries(formData));
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (error) {
    return { ...toActionError(error, { action }), values: {} };
  }
}

export async function revokeUserSessionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runSimple('revokeUserSession', formData, (input) =>
    revokeUserSession(revokeUserSessionSchema.parse(input)),
  );
}

export async function revokeUserTokenAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runSimple('revokeUserToken', formData, (input) =>
    revokeUserApiToken(revokeUserTokenSchema.parse(input)),
  );
}

export async function verifyUserEmailAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runSimple('verifyUserEmail', formData, (input) =>
    verifyUserEmail(userIdSchema.parse(input)),
  );
}

export async function sendPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runSimple('sendPasswordReset', formData, (input) =>
    sendPasswordResetEmail(userIdSchema.parse(input)),
  );
}

export async function resendVerificationEmailAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runSimple('resendVerificationEmail', formData, (input) =>
    resendVerificationEmail(userIdSchema.parse(input)),
  );
}
