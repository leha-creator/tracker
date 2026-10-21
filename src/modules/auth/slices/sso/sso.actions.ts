'use server';

import { redirect } from 'next/navigation';

import { toActionError } from '@/shared/errors';
import type { ActionFailure } from '@/shared/types';

import { startIdpSignIn } from './sso.service';

export type IdpSignInState = ActionFailure | null;

/** Кнопка «Войти через plwedding ID»: редирект на authorize IdP (вход или регистрация). */
export async function signInWithIdpAction(
  _prev: IdpSignInState,
  formData: FormData,
): Promise<IdpSignInState> {
  let url: string;
  try {
    const returnTo = formData.get('returnTo');
    url = await startIdpSignIn(typeof returnTo === 'string' ? returnTo : '/');
  } catch (error) {
    return toActionError(error, { action: 'signInWithIdp' });
  }
  // redirect() бросает исключение — вызываем вне try/catch.
  redirect(url);
}
