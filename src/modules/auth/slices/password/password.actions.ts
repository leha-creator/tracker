'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ok, toActionError } from '@/shared/errors';
import { formValues, type FormState } from '@/shared/types';

import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './password.schema';
import { changePassword, requestPasswordReset, resetPassword } from './password.service';

/** Форма «Забыли пароль?»: успех — запрос принят (письмо уходит, только если аккаунт есть). */
export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requestPasswordReset(forgotPasswordSchema.parse(Object.fromEntries(formData)));
    return ok(null);
  } catch (error) {
    return {
      ...toActionError(error, { action: 'forgotPassword' }),
      values: formValues(formData, ['email']),
    };
  }
}

/** Новый пароль по ссылке из письма; успех — на вход с подсказкой. Пароли в форму не возвращаем. */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await resetPassword(resetPasswordSchema.parse(Object.fromEntries(formData)));
  } catch (error) {
    return { ...toActionError(error, { action: 'resetPassword' }), values: {} };
  }
  // redirect() бросает исключение — вызываем вне try/catch.
  redirect('/login?reset=1');
}

/** Смена пароля в профиле. Пароли в форму не возвращаем. */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await changePassword(changePasswordSchema.parse(Object.fromEntries(formData)));
  } catch (error) {
    return { ...toActionError(error, { action: 'changePassword' }), values: {} };
  }
  revalidatePath('/profile/security');
  return ok(null);
}
