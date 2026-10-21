import { isAPIError } from 'better-auth/api';

import { ForbiddenError, RateLimitError } from '@/shared/errors';

const DEFAULT_RETRY_AFTER_SECONDS = 60;

function retryAfterSeconds(headers: HeadersInit | undefined): number {
  const value = headers ? new Headers(headers).get('x-retry-after') : null;
  const seconds = value ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Переводит ошибки Better Auth при старте входа в доменные. Неизвестные ошибки возвращаются как
 * есть: toActionError превратит их в INTERNAL_ERROR без раскрытия деталей.
 */
export function mapAuthError(error: unknown): unknown {
  if (!isAPIError(error)) return error;

  if (error.statusCode === 429) {
    return new RateLimitError(retryAfterSeconds(error.headers), { cause: error });
  }

  const code = typeof error.body?.code === 'string' ? error.body.code : undefined;
  switch (code) {
    case 'BANNED_USER':
      return new ForbiddenError('Учётная запись заблокирована', { cause: error });
    case 'SIGN_IN_PROVIDER_NOT_ALLOWED':
      return new ForbiddenError('Вход возможен только через plwedding ID', { cause: error });
    default:
      return error;
  }
}
