import { isAPIError } from 'better-auth/api';

import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

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
