import type { SignInMethod, SignUpMethod } from '@/shared/audit/client';

import { OIDC_PROVIDER_ID } from './oidc-config';

/** Путь колбэка OAuth в контексте хуков Better Auth — шаблон маршрута, провайдер — в params.id. */
const OAUTH_CALLBACK_ROUTE = '/callback/:id';

/** Что известно хуку о запросе: шаблон пути эндпоинта и параметры маршрута. */
export interface AuthHookRequest {
  path?: string | null;
  params?: Record<string, unknown> | null;
}

/** Провайдер OAuth-колбэка (github, plwedding) или null, если запрос — не колбэк. */
export function oauthCallbackProvider(request: AuthHookRequest | null | undefined): string | null {
  if (!request?.path) return null;
  if (request.path === OAUTH_CALLBACK_ROUTE) {
    const id = request.params?.id;
    return typeof id === 'string' ? id : null;
  }
  // Подставленный путь (/callback/github) — на случай, если хук получит его вместо шаблона.
  const match = /^\/callback\/([\w-]+)$/.exec(request.path);
  return match?.[1] ?? null;
}

/** Запрос — колбэк входа через IdP plwedding ID. */
export function isOidcCallback(request: AuthHookRequest | null | undefined): boolean {
  return oauthCallbackProvider(request) === OIDC_PROVIDER_ID;
}

/**
 * Способ входа по эндпоинту Better Auth, который создал сессию. Путь и параметры приходят в
 * контексте хука session.create.after; хук не знает провайдера иначе как по маршруту.
 */
export function signInMethodFromRequest(request: AuthHookRequest | null | undefined): SignInMethod {
  const path = request?.path;
  if (!path) return 'other';
  if (path === '/sign-in/email' || path === '/sign-up/email') return 'password';
  const provider = oauthCallbackProvider(request);
  if (provider === OIDC_PROVIDER_ID) return 'oidc';
  if (provider === 'github') return 'github';
  if (path.startsWith('/two-factor/')) return 'two_factor';
  return 'other';
}

/** Способ регистрации по эндпоинту, создавшему пользователя. */
export function signUpMethodFromRequest(request: AuthHookRequest | null | undefined): SignUpMethod {
  const provider = oauthCallbackProvider(request);
  if (provider === OIDC_PROVIDER_ID) return 'oidc';
  if (provider === 'github') return 'github';
  return 'email';
}
