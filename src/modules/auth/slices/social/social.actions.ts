'use server';

import { redirect } from 'next/navigation';

import { toActionError } from '@/shared/errors';
import type { ActionFailure } from '@/shared/types';

import { startGithubSignIn } from './social.service';

export type SocialSignInState = ActionFailure | null;

/** Кнопка «Войти через GitHub»: редирект на авторизацию GitHub (вход или регистрация). */
export async function signInWithGithubAction(
  _prev: SocialSignInState,
  formData: FormData,
): Promise<SocialSignInState> {
  let url: string;
  try {
    const returnTo = formData.get('returnTo');
    url = await startGithubSignIn(typeof returnTo === 'string' ? returnTo : '/');
  } catch (error) {
    return toActionError(error, { action: 'signInWithGithub' });
  }
  // redirect() бросает исключение — вызываем вне try/catch.
  redirect(url);
}
