import 'server-only';

import { after } from 'next/server';

import { createLogger, maskEmail } from '@/shared/logger';

import { sendMail, type MailMessage } from './mailer';

const log = createLogger('mail');

/**
 * Отправляет письмо после ответа пользователю (`after()`); вне запроса Next.js — сразу в фоне.
 * Никогда не бросает: сбой SMTP только логируется. Время ответа не зависит от отправки — по нему
 * нельзя понять, существует ли аккаунт (сброс пароля, повторная отправка подтверждения).
 * `template` — имя шаблона для логов; ссылки и токены из письма в логи не пишутся.
 */
export function sendMailInBackground(message: MailMessage, template: string): void {
  const to = maskEmail(message.to);
  const task = async () => {
    try {
      await sendMail(message);
    } catch (error) {
      log.error({ err: error, template, to }, '[mail.background] send failed');
    }
  };
  try {
    after(task);
  } catch (error) {
    log.debug({ err: error, template }, '[mail.background] after() unavailable, sending now');
    void task();
  }
  log.info({ template, to }, '[mail.background] queued');
}
