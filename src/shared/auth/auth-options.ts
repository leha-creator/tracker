/**
 * Чистые части конфигурации Better Auth (тестируются без экземпляра Better Auth).
 */

/** Правило лимита Better Auth: `max` запросов за `window` секунд. */
export interface AuthRateLimitRule {
  window: number;
  max: number;
}

/**
 * Лимиты HTTP-эндпоинтов /api/auth/* (rateLimit.customRules), строже встроенных. Вход — только
 * через IdP: ограничиваем начало входа и привязки и колбэк OAuth (обмен кода на токены).
 */
export function buildAuthRateLimitRules(): Record<string, AuthRateLimitRule> {
  return {
    '/sign-in/social': { window: 60, max: 10 },
    '/link-social': { window: 60, max: 10 },
    '/callback/*': { window: 60, max: 20 },
  };
}

/**
 * Можно ли начать вход через провайдера. Вход — только через IdP; GitHub подключён к Better Auth
 * ради привязки аккаунта для PR (linkSocial) и токена GitHub, но не как способ входа.
 */
export function isSignInProviderAllowed(provider: unknown, idpProviderId: string): boolean {
  return provider === idpProviderId;
}
