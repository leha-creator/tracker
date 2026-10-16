import 'server-only';

import { headers } from 'next/headers';

import { safeRedirectPath } from '@/shared/access';
import { getAuth, verifyEmailCallbackPath } from '@/shared/auth';
import { createLogger, maskEmail } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

import { mapAuthError } from './credentials.errors';
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
    throw mapped;
  }
}

export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  log.info('[credentials.signOut] signed out');
}
