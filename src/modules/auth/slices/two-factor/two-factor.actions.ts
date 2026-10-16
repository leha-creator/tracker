'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { safeRedirectPath } from '@/shared/access';
import { ok, toActionError } from '@/shared/errors';
import { type FormState } from '@/shared/types';

import type { TwoFactorSetup } from './two-factor.dto';
import {
  confirmEnableSchema,
  passwordConfirmSchema,
  verifyBackupCodeSchema,
  verifyTotpSchema,
} from './two-factor.schema';
import {
  confirmEnableTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  startEnableTwoFactor,
  verifySignInBackupCode,
  verifySignInTotp,
} from './two-factor.service';

const SECURITY_PATH = '/profile/security';

function parse(formData: FormData) {
  return Object.fromEntries(formData);
}

/** Второй шаг входа: код из приложения или резервный код (`method=backup`). */
export async function verifyTwoFactorSignInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let returnTo: string;
  try {
    if (formData.get('method') === 'backup') {
      const input = verifyBackupCodeSchema.parse(parse(formData));
      await verifySignInBackupCode(input);
      returnTo = safeRedirectPath(input.returnTo);
    } else {
      const input = verifyTotpSchema.parse(parse(formData));
      await verifySignInTotp(input);
      returnTo = safeRedirectPath(input.returnTo);
    }
  } catch (error) {
    // Коды в форму не возвращаем.
    return { ...toActionError(error, { action: 'verifyTwoFactorSignIn' }), values: {} };
  }
  // redirect() бросает исключение — вызываем вне try/catch.
  redirect(returnTo);
}

/** Включение 2FA, шаг 1: пароль → секрет для приложения и резервные коды. */
export async function startEnableTwoFactorAction(
  _prev: FormState<TwoFactorSetup>,
  formData: FormData,
): Promise<FormState<TwoFactorSetup>> {
  try {
    return ok(await startEnableTwoFactor(passwordConfirmSchema.parse(parse(formData))));
  } catch (error) {
    return { ...toActionError(error, { action: 'startEnableTwoFactor' }), values: {} };
  }
}

/** Включение 2FA, шаг 2: код из приложения. */
export async function confirmEnableTwoFactorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await confirmEnableTwoFactor(confirmEnableSchema.parse(parse(formData)));
  } catch (error) {
    return { ...toActionError(error, { action: 'confirmEnableTwoFactor' }), values: {} };
  }
  revalidatePath(SECURITY_PATH);
  return ok(null);
}

export async function disableTwoFactorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await disableTwoFactor(passwordConfirmSchema.parse(parse(formData)));
  } catch (error) {
    return { ...toActionError(error, { action: 'disableTwoFactor' }), values: {} };
  }
  revalidatePath(SECURITY_PATH);
  return ok(null);
}

/** Новые резервные коды (показываются один раз). */
export async function regenerateBackupCodesAction(
  _prev: FormState<string[]>,
  formData: FormData,
): Promise<FormState<string[]>> {
  try {
    return ok(await regenerateBackupCodes(passwordConfirmSchema.parse(parse(formData))));
  } catch (error) {
    return { ...toActionError(error, { action: 'regenerateBackupCodes' }), values: {} };
  }
}
