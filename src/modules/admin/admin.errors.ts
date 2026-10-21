import { isAPIError } from 'better-auth/api';

import {
  AppError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '@/shared/errors';
import { IdpApiError } from '@/shared/idp';

/**
 * Переводит ошибки плагина admin в доменные. Это второй рубеж: сервис проверяет права и правила
 * сам до вызова плагина. Неизвестные ошибки возвращаются как есть
 * (toActionError превратит их в INTERNAL_ERROR без деталей).
 */
export function mapAdminError(error: unknown): unknown {
  if (!isAPIError(error)) return error;

  const code = typeof error.body?.code === 'string' ? error.body.code : '';
  const options = { cause: error };

  switch (code) {
    case 'YOU_CANNOT_BAN_YOURSELF':
    case 'YOU_CANNOT_REMOVE_YOURSELF':
      return new ValidationError(
        'Это действие нельзя выполнить над своей учётной записью',
        options,
      );
    case 'USER_NOT_FOUND':
      return new NotFoundError('Пользователь не найден', options);
    case 'YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE':
    case 'INVALID_ROLE_TYPE':
      return new ValidationError('Недопустимая роль', options);
    default:
      if (code.startsWith('YOU_ARE_NOT_ALLOWED_TO_')) {
        return new ForbiddenError('Недостаточно прав', options);
      }
      return error;
  }
}

/** Текст, когда IdP не ответил или ответил сбоем: операцию можно повторить позже. */
export const IDP_ADMIN_UNAVAILABLE_MESSAGE =
  'plwedding ID сейчас недоступен — повторите действие через минуту';

/**
 * Переводит ошибки Admin API IdP в доменные. Сообщения IdP написаны для администратора
 * (docs/admin-api.md) и показываются как есть. Сбой связи, 5xx и отказ в аутентификации клиента
 * — 503 с общим текстом: администратор их не исправит, причина — в логах.
 */
export function mapIdpAdminError(error: unknown): unknown {
  if (!(error instanceof IdpApiError)) return error;
  const options = { cause: error };
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return new ValidationError(error.message, options);
    case 'FORBIDDEN':
      return new ForbiddenError(error.message, options);
    case 'NOT_FOUND':
      return new NotFoundError(error.message, options);
    case 'RATE_LIMITED':
      return new RateLimitError(error.retryAfterSeconds ?? 60, options);
    default:
      return new AppError(IDP_ADMIN_UNAVAILABLE_MESSAGE, {
        code: 'INTERNAL_ERROR',
        httpStatus: 503,
        expose: true,
        cause: error,
      });
  }
}
