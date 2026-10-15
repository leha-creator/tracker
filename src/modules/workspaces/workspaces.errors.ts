import { isAPIError } from 'better-auth/api';

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

/**
 * Переводит ошибки плагина organization в доменные. Это второй рубеж: сервисы проверяют доступ
 * и инварианты сами до вызова плагина. Неизвестные ошибки возвращаются как есть
 * (toActionError превратит их в INTERNAL_ERROR без деталей).
 */
export function mapOrganizationError(error: unknown): unknown {
  if (!isAPIError(error)) return error;

  const code = typeof error.body?.code === 'string' ? error.body.code : '';
  const options = { cause: error };

  switch (code) {
    case 'ORGANIZATION_ALREADY_EXISTS':
    case 'ORGANIZATION_SLUG_ALREADY_TAKEN':
      return new ConflictError('Адрес пространства уже занят', {
        ...options,
        fieldErrors: { slug: ['Этот адрес уже занят'] },
      });
    case 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION':
      return new ConflictError('Пользователь уже участник пространства', {
        ...options,
        fieldErrors: { email: ['Уже участник пространства'] },
      });
    case 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION':
      return new ConflictError('Пользователь уже приглашён', {
        ...options,
        fieldErrors: { email: ['Приглашение уже отправлено'] },
      });
    case 'ORGANIZATION_NOT_FOUND':
      return new NotFoundError('Пространство не найдено', options);
    case 'MEMBER_NOT_FOUND':
    case 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION':
      return new NotFoundError('Участник не найден', options);
    case 'INVITATION_NOT_FOUND':
      return new NotFoundError('Приглашение не найдено или уже недействительно', options);
    case 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION':
      return new ForbiddenError('Приглашение адресовано другому пользователю', options);
    case 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER':
    case 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER':
      return new ValidationError(
        'В пространстве должен остаться хотя бы один владелец. Сначала назначьте другого владельца.',
        options,
      );
    case 'YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS':
      return new ValidationError('Достигнут лимит пространств на пользователя', options);
    case 'ORGANIZATION_MEMBERSHIP_LIMIT_REACHED':
      return new ValidationError('Достигнут лимит участников пространства', options);
    case 'INVITATION_LIMIT_REACHED':
      return new ValidationError('Достигнут лимит ожидающих приглашений', options);
    default:
      if (
        code.startsWith('YOU_ARE_NOT_ALLOWED_TO_') ||
        code === 'YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION'
      ) {
        return new ForbiddenError('Недостаточно прав', options);
      }
      return error;
  }
}
