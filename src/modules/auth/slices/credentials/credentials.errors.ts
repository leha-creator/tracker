import { isAPIError } from 'better-auth/api';

import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '@/shared/errors';

/**
 * Переводит ошибки Better Auth в доменные. Неизвестные ошибки возвращаются как есть:
 * toActionError превратит их в INTERNAL_ERROR без раскрытия деталей.
 */
export function mapAuthError(error: unknown): unknown {
  if (!isAPIError(error)) return error;

  const code = typeof error.body?.code === 'string' ? error.body.code : undefined;
  switch (code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return new ConflictError('Пользователь с таким email уже зарегистрирован', { cause: error });
    case 'INVALID_EMAIL_OR_PASSWORD':
      // Одно сообщение для неверного email и пароля: не раскрываем существование аккаунта.
      return new UnauthorizedError('Неверный email или пароль', { cause: error });
    case 'BANNED_USER':
      return new ForbiddenError('Учётная запись заблокирована', { cause: error });
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return new ValidationError('Некорректный пароль', {
        cause: error,
        fieldErrors: { password: ['Пароль не соответствует требованиям к длине'] },
      });
    case 'INVALID_EMAIL':
      return new ValidationError('Некорректный email', {
        cause: error,
        fieldErrors: { email: ['Некорректный email'] },
      });
    default:
      return error;
  }
}
