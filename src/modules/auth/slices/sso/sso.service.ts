import 'server-only';

import { headers } from 'next/headers';

import { safeRedirectPath } from '@/shared/access';
import {
  getAuth,
  idpAccountUrl,
  isOidcSignInAvailable,
  loadOidcDiscovery,
  OIDC_PROVIDER_ID,
} from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { AppError, InternalError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { withReturnTo } from '../../models';
import { mapAuthError } from './sso.errors';
import { IDP_UNAVAILABLE_MESSAGE } from './sso.messages';

const log = createLogger('auth.sso');

/**
 * Можно ли войти через IdP plwedding ID: IdP ответил на discovery. Пока IdP недоступен,
 * провайдер не подключён (см. loadOidcDiscovery) — вместо кнопки страница входа показывает пояснение.
 */
export async function getIdpSignInStatus(): Promise<'available' | 'unavailable'> {
  await loadOidcDiscovery();
  return isOidcSignInAvailable() ? 'available' : 'unavailable';
}

/** Адрес страницы ошибки входа через IdP: /login с тем же returnTo. */
export function idpErrorCallbackPath(returnTo: string): string {
  return withReturnTo('/login', returnTo);
}

/**
 * Начинает вход через IdP: Better Auth кладёт state и PKCE в cookie (nextCookies) и возвращает
 * адрес authorize IdP. Новый пользователь создаётся, существующий с тем же подтверждённым email
 * привязывается. Ошибки колбэка вернутся на /login?error=<код>.
 */
export async function startIdpSignIn(returnTo: string): Promise<string> {
  const status = await getIdpSignInStatus();
  if (status === 'unavailable') {
    log.warn('[sso.start] rejected: IdP unavailable');
    // 503 с понятным текстом: IdP недоступен, повтор discovery — в фоне.
    throw new AppError(IDP_UNAVAILABLE_MESSAGE, {
      code: 'INTERNAL_ERROR',
      httpStatus: 503,
      expose: true,
    });
  }
  const callbackURL = safeRedirectPath(returnTo);
  log.debug({ returnTo: callbackURL }, '[sso.start] start');

  let result: { url?: string };
  try {
    result = await getAuth().api.signInSocial({
      body: {
        provider: OIDC_PROVIDER_ID,
        callbackURL,
        errorCallbackURL: idpErrorCallbackPath(callbackURL),
        newUserCallbackURL: callbackURL,
      },
      headers: await headers(),
    });
  } catch (error) {
    log.warn('[sso.start] failed');
    throw mapAuthError(error);
  }
  if (!result.url) throw new InternalError('Better Auth не вернул адрес авторизации IdP');
  log.info('[sso.start] redirect to IdP');
  return result.url;
}

/** Страница учётной записи в IdP: имя, email, фото, пароль, 2FA и сеансы plwedding ID. */
export function getIdpAccountUrl(): string {
  return idpAccountUrl(getEnv().OIDC_ISSUER);
}
