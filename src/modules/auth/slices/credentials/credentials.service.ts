import 'server-only';

import { headers } from 'next/headers';

import { safeRedirectPath } from '@/shared/access';
import { auditActorFromSession, auditRequestContext, recordAuditEvent } from '@/shared/audit';
import { getAuth, getSession, verifyEmailCallbackPath } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { ForbiddenError } from '@/shared/errors';
import { createLogger, maskEmail } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';
import {
  evaluateSignup,
  getSignupPolicy as loadSignupPolicy,
  SIGNUP_REJECTION_MESSAGES,
  type SignupPolicy,
} from '@/shared/resource-settings';

import { authErrorCode, mapAuthError } from './credentials.errors';
import { credentialsRepository } from './credentials.repository';
import type { SignInInput, SignUpInput } from './credentials.schema';

const log = createLogger('auth.credentials');

/** Итог входа: сессия создана или нужен второй шаг (код 2FA). */
export type SignInOutcome = { kind: 'signed-in'; userId: string } | { kind: 'two-factor' };

/** Итог регистрации: сессия создана или нужно подтвердить email по письму. */
export type SignUpOutcome = { kind: 'signed-in'; userId: string } | { kind: 'verification-sent' };

export async function signUp(input: SignUpInput): Promise<SignUpOutcome> {
  const email = maskEmail(input.email);
  log.debug({ email }, '[credentials.signUp] start');
  const requestHeaders = await headers();
  await enforceRateLimit('sign-up', { ip: getClientIp(requestHeaders) });
  // До Better Auth: отказ одинаков для занятых и свободных адресов (хук создания пользователя
  // срабатывает только для новых и выдал бы, что email уже зарегистрирован).
  const rejection = await evaluateSignup({
    email: input.email,
    isAdminEmail: getEnv().ADMIN_EMAILS.includes(input.email.toLowerCase()),
  });
  if (rejection) throw new ForbiddenError(SIGNUP_REJECTION_MESSAGES[rejection]);

  try {
    const result = await getAuth().api.signUpEmail({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        // Ссылка из письма подтверждения вернёт на /verify-email, а оттуда — на returnTo.
        callbackURL: verifyEmailCallbackPath(safeRedirectPath(input.returnTo)),
      },
      headers: requestHeaders,
    });
    // При обязательном подтверждении Better Auth не создаёт сессию (token: null). Для занятого
    // email ответ такой же (без перечисления аккаунтов), поэтому userId здесь не логируем.
    if (!result.token) {
      log.info({ email }, '[credentials.signUp] verification sent');
      return { kind: 'verification-sent' };
    }
    log.info({ userId: result.user.id }, '[credentials.signUp] user registered');
    return { kind: 'signed-in', userId: result.user.id };
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ email, code: (mapped as { code?: string }).code }, '[credentials.signUp] failed');
    throw mapped;
  }
}

/** Политика регистрации из настроек ресурса — для страниц /register и /login. */
export function getSignupPolicy(): Promise<SignupPolicy> {
  return loadSignupPolicy();
}

export async function signIn(input: SignInInput): Promise<SignInOutcome> {
  const email = maskEmail(input.email);
  log.debug({ email }, '[credentials.signIn] start');
  const requestHeaders = await headers();
  await enforceRateLimit('sign-in', { ip: getClientIp(requestHeaders), email: input.email });

  try {
    const result = await getAuth().api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
        // Для повторного письма подтверждения (sendOnSignIn), если email не подтверждён.
        callbackURL: verifyEmailCallbackPath(safeRedirectPath(input.returnTo)),
      },
      headers: requestHeaders,
    });
    // Пользователь с 2FA: плагин поставил cookie второго шага (nextCookies), сессии ещё нет.
    if ('twoFactorRedirect' in result && result.twoFactorRedirect) {
      log.info({ email }, '[credentials.signIn] two-factor required');
      return { kind: 'two-factor' };
    }
    if (!('user' in result)) {
      throw new Error('Better Auth sign-in returned neither a user nor a two-factor redirect');
    }
    log.info({ userId: result.user.id }, '[credentials.signIn] signed in');
    return { kind: 'signed-in', userId: result.user.id };
  } catch (error) {
    const mapped = mapAuthError(error);
    log.warn({ email, code: (mapped as { code?: string }).code }, '[credentials.signIn] failed');
    await recordFailedSignIn(input.email, authErrorCode(error), requestHeaders);
    throw mapped;
  }
}

/**
 * Неудачный вход — в журнал пользователя, если такой email есть. Для неизвестного адреса событие
 * не пишется: журнал не копит чужие адреса, попытку видно в логе.
 */
async function recordFailedSignIn(email: string, code: string, requestHeaders: Headers) {
  try {
    const userId = await credentialsRepository.findUserIdByEmail(email);
    if (!userId) return;
    await recordAuditEvent({
      kind: 'auth.sign_in_failed',
      actor: null,
      targetUserId: userId,
      data: { method: 'password', reason: code },
      request: auditRequestContext(requestHeaders),
    });
  } catch (error) {
    log.error({ err: error }, '[credentials.signIn] failed to record audit event');
  }
}

export async function signOut(): Promise<void> {
  const requestHeaders = await headers();
  const session = await getSession();
  await getAuth().api.signOut({ headers: requestHeaders });
  log.info('[credentials.signOut] signed out');
  if (session) {
    await recordAuditEvent({
      kind: 'auth.sign_out',
      actor: auditActorFromSession(session),
      data: {},
      request: auditRequestContext(requestHeaders),
    });
  }
}
