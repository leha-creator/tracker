/**
 * Чистые части конфигурации Better Auth (тестируются без экземпляра Better Auth).
 */

/** Правило лимита Better Auth: `max` запросов за `window` секунд. */
export interface AuthRateLimitRule {
  window: number;
  max: number;
}

/**
 * Лимиты HTTP-эндпоинтов /api/auth/* (rateLimit.customRules), строже встроенных. Они действуют
 * только на прямые HTTP-запросы: Server Actions ограничивает src/shared/rate-limit.
 */
export function buildAuthRateLimitRules(): Record<string, AuthRateLimitRule> {
  return {
    '/sign-in/email': { window: 60, max: 5 },
    '/sign-up/email': { window: 60, max: 3 },
    '/request-password-reset': { window: 300, max: 3 },
    '/reset-password': { window: 60, max: 5 },
    '/send-verification-email': { window: 300, max: 3 },
    '/change-password': { window: 60, max: 5 },
    '/two-factor/*': { window: 60, max: 5 },
  };
}

/**
 * Ответ на регистрацию с уже занятым email (при обязательном подтверждении Better Auth не
 * сообщает, что адрес занят). Поля плагинов — как у настоящего нового пользователя, иначе по
 * ответу можно было бы понять, что аккаунт существует.
 */
export function buildSyntheticUser(params: {
  coreFields: Record<string, unknown>;
  additionalFields: Record<string, unknown>;
  id: string;
}): Record<string, unknown> {
  return {
    ...params.coreFields,
    role: 'user',
    banned: false,
    banReason: null,
    banExpires: null,
    isAgent: false,
    twoFactorEnabled: false,
    ...params.additionalFields,
    id: params.id,
  };
}

/** Адрес, куда Better Auth вернёт пользователя после ссылки подтверждения email. */
export function verifyEmailCallbackPath(returnTo: string): string {
  return returnTo === '/'
    ? '/verify-email'
    : `/verify-email?returnTo=${encodeURIComponent(returnTo)}`;
}
