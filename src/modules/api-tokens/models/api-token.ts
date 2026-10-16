/**
 * Личный токен доступа агента: `tkr_` + 32 случайных байта (base64url, 43 символа).
 * В БД хранится только SHA-256: у токена высокая энтропия, медленный хеш не нужен.
 */
export const API_TOKEN_PREFIX = 'tkr_';
/** Сколько первых символов токена храним и показываем в списке (`tkr_` + 8). */
export const API_TOKEN_DISPLAY_PREFIX_LENGTH = 12;
/** Сколько активных (не отозванных) токенов может быть у пользователя. */
export const API_TOKENS_PER_USER_LIMIT = 20;
export const API_TOKEN_NAME_MAX_LENGTH = 60;
/** `lastUsedAt` обновляется не чаще этого интервала. */
export const API_TOKEN_TOUCH_INTERVAL_MS = 60_000;

const TOKEN_PATTERN = /^tkr_[A-Za-z0-9_-]{43}$/;
const BEARER_PATTERN = /^Bearer[ \t]+(\S+)[ \t]*$/i;

export const API_TOKEN_EXPIRY_OPTIONS = ['30d', '90d', '365d', 'never'] as const;
export type ApiTokenExpiry = (typeof API_TOKEN_EXPIRY_OPTIONS)[number];

export const API_TOKEN_EXPIRY_LABELS: Record<ApiTokenExpiry, string> = {
  '30d': '30 дней',
  '90d': '90 дней',
  '365d': '1 год',
  never: 'Бессрочно',
};

const EXPIRY_DAYS: Record<Exclude<ApiTokenExpiry, 'never'>, number> = {
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

export function isApiTokenFormat(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** Токен из заголовка `Authorization: Bearer tkr_…` или null (нет заголовка, другая схема, мусор). */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = BEARER_PATTERN.exec(header.trim());
  const token = match?.[1];
  return token && isApiTokenFormat(token) ? token : null;
}

export function expiryToDate(expiry: ApiTokenExpiry, now: Date): Date | null {
  if (expiry === 'never') return null;
  return new Date(now.getTime() + EXPIRY_DAYS[expiry] * 24 * 60 * 60 * 1000);
}

export type ApiTokenState = 'active' | 'revoked' | 'expired';

export function apiTokenState(
  row: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): ApiTokenState {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/** Пора ли обновить `lastUsedAt` (не чаще раза в минуту). */
export function shouldTouchApiToken(lastUsedAt: Date | null, now: Date): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= API_TOKEN_TOUCH_INTERVAL_MS;
}
