import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { getEnv } from '@/shared/env';
import { InternalError } from '@/shared/errors';
import { createLogger, maskEmail } from '@/shared/logger';

const log = createLogger('mail');

// Сбой почты не должен держать запрос: по умолчанию nodemailer ждёт DNS и приветствие до 30 с.
const DNS_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function createTransport(): Transporter {
  const env = getEnv();
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    dnsTimeout: DNS_TIMEOUT_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  log.info(
    { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE },
    '[mail] transport initialized',
  );
  return transport;
}

// Singleton через globalThis: HMR в dev не плодит SMTP-пулы.
const globalForMail = globalThis as unknown as { mailTransport?: Transporter };

function getTransport(): Transporter {
  globalForMail.mailTransport ??= createTransport();
  return globalForMail.mailTransport;
}

/** Домен `.invalid` (RFC 2606) заведомо недоставляем — например, служебная почта агентов. */
export function isUndeliverableAddress(address: string): boolean {
  return /\.invalid$/i.test(address.trim());
}

/**
 * Отправляет письмо. Бросает InternalError при сбое SMTP (адресат в логах маскируется).
 * Адреса `*.invalid` пропускаются без ошибки: `messageId` пустой.
 */
export async function sendMail(message: MailMessage): Promise<{ messageId: string }> {
  const to = maskEmail(message.to);
  if (isUndeliverableAddress(message.to)) {
    log.warn({ to }, '[mail] undeliverable address skipped');
    return { messageId: '' };
  }
  log.debug({ to, subject: message.subject }, '[mail.send]');
  try {
    const info = await getTransport().sendMail({ from: getEnv().MAIL_FROM, ...message });
    log.info({ messageId: info.messageId, to }, '[mail.send] sent');
    return { messageId: info.messageId };
  } catch (error) {
    log.error({ err: error, to }, '[mail.send] failed');
    throw new InternalError('Не удалось отправить письмо', { cause: error });
  }
}
