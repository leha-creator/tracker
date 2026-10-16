'use server';

import { redirect } from 'next/navigation';

import { safeRedirectPath } from '@/shared/access';
import { AppError, toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import type { ActionFailure } from '@/shared/types';

import { withReturnTo } from '../../models';
import { EMAIL_NOT_VERIFIED_REASON } from './credentials.errors';
import { signInSchema, signUpSchema } from './credentials.schema';
import { signIn, signOut, signUp } from './credentials.service';

const log = createLogger('auth.actions');

/**
 * Состояние формы для useActionState. Успех всегда завершается редиректом, поэтому в состоянии
 * только ошибка и введённые значения (без паролей), чтобы форма не очищалась.
 */
export type AuthFormState =
  | (ActionFailure & {
      values: Record<string, string>;
      /** Вход отклонён из-за неподтверждённого email: форма предлагает отправить письмо ещё раз. */
      needsVerification?: boolean;
    })
  | null;

function isEmailNotVerified(error: unknown): boolean {
  return error instanceof AppError && error.details?.reason === EMAIL_NOT_VERIFIED_REASON;
}

function formValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === 'string' ? value : ''];
    }),
  );
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  let target: string;
  try {
    const input = signInSchema.parse(Object.fromEntries(formData));
    const outcome = await signIn(input);
    const returnTo = safeRedirectPath(input.returnTo);
    target = outcome.kind === 'two-factor' ? withReturnTo('/login/two-factor', returnTo) : returnTo;
  } catch (error) {
    return {
      ...toActionError(error, { action: 'signIn' }),
      values: formValues(formData, ['email']),
      ...(isEmailNotVerified(error) ? { needsVerification: true } : {}),
    };
  }
  // redirect() бросает исключение — вызываем вне try/catch.
  log.debug({ to: target }, '[auth.actions.signIn] redirect');
  redirect(target);
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  let target: string;
  try {
    const input = signUpSchema.parse(Object.fromEntries(formData));
    const outcome = await signUp(input);
    const returnTo = safeRedirectPath(input.returnTo);
    target =
      outcome.kind === 'verification-sent'
        ? withReturnTo('/verify-email?sent=1', returnTo)
        : returnTo;
  } catch (error) {
    return {
      ...toActionError(error, { action: 'signUp' }),
      values: formValues(formData, ['name', 'email']),
    };
  }
  log.debug({ to: target }, '[auth.actions.signUp] redirect');
  redirect(target);
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}
