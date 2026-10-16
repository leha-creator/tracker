import 'server-only';

import { isAPIError } from 'better-auth/api';
import { headers } from 'next/headers';

import { requireUser } from '@/shared/access';
import { getAuth, sendPasswordChangedMail } from '@/shared/auth';
import { createLogger, maskEmail } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

import { mapAuthError } from '../credentials/credentials.errors';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './password.schema';

const log = createLogger('auth.password');

/** Страница, на которую ведёт ссылка из письма (Better Auth добавит ?token= или ?error=). */
const RESET_PASSWORD_PATH = '/reset-password';

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

/**
 * Запрос ссылки сброса пароля. Ответ всегда одинаковый (письмо уходит, только если аккаунт
 * есть): по нему нельзя понять, зарегистрирован ли email. Показывается только превышение лимита.
 */
export async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
  const email = maskEmail(input.email);
  log.debug({ email }, '[password.resetRequest] start');
  const requestHeaders = await headers();
  await enforceRateLimit('password-reset-request', {
    ip: getClientIp(requestHeaders),
    email: input.email,
  });

  try {
    await getAuth().api.requestPasswordReset({
      body: { email: input.email, redirectTo: RESET_PASSWORD_PATH },
      headers: requestHeaders,
    });
    log.info({ email }, '[password.resetRequest] processed');
  } catch (error) {
    if (isAPIError(error) && error.statusCode !== 429) {
      const code: unknown = error.body?.code;
      log.debug({ email, code }, '[password.resetRequest] ignored');
      return;
    }
    const mapped = mapAuthError(error);
    log.warn({ email, code: errorCode(mapped) }, '[password.resetRequest] failed');
    throw mapped;
  }
}

/** Новый пароль по токену из письма. Better Auth завершает все сессии и шлёт «пароль изменён». */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  log.debug('[password.reset] start');
  const requestHeaders = await headers();
  await enforceRateLimit('password-reset', { ip: getClientIp(requestHeaders) });

  try {
    await getAuth().api.resetPassword({
      body: { newPassword: input.password, token: input.token },
      headers: requestHeaders,
    });
    log.info('[password.reset] completed');
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ code: errorCode(mapped) }, '[password.reset] failed');
    throw mapped;
  }
}

/** Смена пароля вошедшим пользователем: другие сессии завершаются, на почту — уведомление. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const session = await requireUser();
  const userId = session.user.id;
  log.debug({ userId }, '[password.change] start');
  const requestHeaders = await headers();
  await enforceRateLimit('change-password', { ip: getClientIp(requestHeaders), userId });

  try {
    await getAuth().api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    const mapped = mapAuthError(error, { passwordField: 'currentPassword' });
    log.warn({ userId, code: errorCode(mapped) }, '[password.change] failed');
    throw mapped;
  }
  log.info({ userId }, '[password.change] completed');
  sendPasswordChangedMail({ email: session.user.email, name: session.user.name });
}
