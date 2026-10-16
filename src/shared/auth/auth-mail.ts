import 'server-only';

import { getEnv } from '@/shared/env';
import { sendMailInBackground } from '@/shared/mail';

import { buildPasswordChangedEmail } from './auth-emails';

/** Адрес приложения без завершающего «/» — для ссылок в письмах. */
export function appUrl(): string {
  return getEnv().BETTER_AUTH_URL.replace(/\/$/, '');
}

/** Письмо «пароль изменён» (после сброса и смены пароля). В фоне, никогда не бросает. */
export function sendPasswordChangedMail(user: { email: string; name: string }): void {
  sendMailInBackground(
    {
      to: user.email,
      ...buildPasswordChangedEmail({
        name: user.name,
        forgotPasswordUrl: `${appUrl()}/forgot-password`,
      }),
    },
    'password-changed',
  );
}
