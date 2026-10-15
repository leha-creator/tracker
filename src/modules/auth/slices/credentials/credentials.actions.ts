'use server';

import { redirect } from 'next/navigation';

import { safeRedirectPath } from '@/shared/access';
import { toActionError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import type { ActionFailure } from '@/shared/types';

import { signInSchema, signUpSchema } from './credentials.schema';
import { signIn, signOut, signUp } from './credentials.service';

const log = createLogger('auth.actions');

/**
 * Состояние формы для useActionState. Успех всегда завершается редиректом, поэтому в состоянии
 * только ошибка и введённые значения (без паролей), чтобы форма не очищалась.
 */
export type AuthFormState = (ActionFailure & { values: Record<string, string> }) | null;

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
  let returnTo: string;
  try {
    const input = signInSchema.parse(Object.fromEntries(formData));
    await signIn(input);
    returnTo = safeRedirectPath(input.returnTo);
  } catch (error) {
    return {
      ...toActionError(error, { action: 'signIn' }),
      values: formValues(formData, ['email']),
    };
  }
  // redirect() бросает исключение — вызываем вне try/catch.
  log.debug({ to: returnTo }, '[auth.actions.signIn] redirect');
  redirect(returnTo);
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  let returnTo: string;
  try {
    const input = signUpSchema.parse(Object.fromEntries(formData));
    await signUp(input);
    returnTo = safeRedirectPath(input.returnTo);
  } catch (error) {
    return {
      ...toActionError(error, { action: 'signUp' }),
      values: formValues(formData, ['name', 'email']),
    };
  }
  log.debug({ to: returnTo }, '[auth.actions.signUp] redirect');
  redirect(returnTo);
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}
