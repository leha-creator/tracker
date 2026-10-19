import { isAPIError } from 'better-auth/api';

import { SIGNUP_REJECTION_MESSAGES } from '@/shared/resource-settings/client';

import {
  ConflictError,
  ForbiddenError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@/shared/errors';

/** Признак ошибки «email не подтверждён» в `details.reason`: форма входа предлагает отправить письмо. */
export const EMAIL_NOT_VERIFIED_REASON = 'email-not-verified';

const DEFAULT_RETRY_AFTER_SECONDS = 60;

export interface MapAuthErrorOptions {
  /** Поле формы, к которому относится ошибка `INVALID_PASSWORD` (пароль для подтверждения). */
  passwordField?: string;
}

function retryAfterSeconds(headers: HeadersInit | undefined): number {
  const value = headers ? new Headers(headers).get('x-retry-after') : null;
  const seconds = value ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
}

/** Код ошибки Better Auth (`INVALID_EMAIL_OR_PASSWORD`) для журнала; иначе — `UNKNOWN`. */
export function authErrorCode(error: unknown): string {
  if (!isAPIError(error)) return 'UNKNOWN';
  if (error.statusCode === 429) return 'RATE_LIMITED';
  return typeof error.body?.code === 'string' ? error.body.code : 'UNKNOWN';
}

/**
 * Переводит ошибки Better Auth в доменные. Неизвестные ошибки возвращаются как есть:
 * toActionError превратит их в INTERNAL_ERROR без раскрытия деталей.
 */
export function mapAuthError(error: unknown, options: MapAuthErrorOptions = {}): unknown {
  if (!isAPIError(error)) return error;

  if (error.statusCode === 429) {
    return new RateLimitError(retryAfterSeconds(error.headers), { cause: error });
  }

  const code = typeof error.body?.code === 'string' ? error.body.code : undefined;
  switch (code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return new ConflictError('Пользователь с таким email уже зарегистрирован', { cause: error });
    case 'INVALID_EMAIL_OR_PASSWORD':
      // Одно сообщение для неверного email и пароля: не раскрываем существование аккаунта.
      return new UnauthorizedError('Неверный email или пароль', { cause: error });
    case 'EMAIL_NOT_VERIFIED':
      return new ForbiddenError(
        'Email не подтверждён. Мы отправили письмо со ссылкой для подтверждения — проверьте почту.',
        { cause: error, details: { reason: EMAIL_NOT_VERIFIED_REASON } },
      );
    case 'SIGNUP_CLOSED':
      return new ForbiddenError(SIGNUP_REJECTION_MESSAGES.closed, { cause: error });
    case 'SIGNUP_INVITE_ONLY':
      return new ForbiddenError(SIGNUP_REJECTION_MESSAGES.invite_only, { cause: error });
    case 'SIGNUP_DOMAIN':
      return new ForbiddenError(SIGNUP_REJECTION_MESSAGES.domain, { cause: error });
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
    case 'INVALID_PASSWORD': {
      const field = options.passwordField ?? 'password';
      return new ValidationError('Неверный пароль', {
        cause: error,
        fieldErrors: { [field]: ['Неверный пароль'] },
      });
    }
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return new ValidationError('Ссылка недействительна или устарела. Запросите новую.', {
        cause: error,
      });
    case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
      return new ValidationError(
        'У аккаунта нет пароля. Задайте его через «Забыли пароль?» на странице входа.',
        { cause: error },
      );
    case 'SESSION_NOT_FRESH':
      return new UnauthorizedError('Войдите заново, чтобы продолжить', { cause: error });
    case 'INVALID_CODE':
      return new ValidationError('Неверный код', {
        cause: error,
        fieldErrors: { code: ['Неверный код'] },
      });
    case 'INVALID_BACKUP_CODE':
      return new ValidationError('Неверный резервный код', {
        cause: error,
        fieldErrors: { code: ['Неверный резервный код'] },
      });
    case 'INVALID_TWO_FACTOR_COOKIE':
      return new UnauthorizedError('Время на ввод кода истекло. Войдите заново.', { cause: error });
    case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return new ForbiddenError('Слишком много неверных кодов. Попробуйте позже.', {
        cause: error,
      });
    case 'TWO_FACTOR_NOT_ENABLED':
    case 'TOTP_NOT_ENABLED':
      return new ValidationError('Двухфакторная аутентификация не включена', { cause: error });
    default:
      return error;
  }
}
