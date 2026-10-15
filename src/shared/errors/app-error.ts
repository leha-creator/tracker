export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type FieldErrors = Record<string, string[]>;

export interface AppErrorOptions {
  code: ErrorCode;
  httpStatus: number;
  /** Можно ли показывать сообщение клиенту. По умолчанию: true для 4xx, false для 5xx. */
  expose?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/** Базовая ошибка приложения. Доменные ошибки (4xx) отделены от инфраструктурных (5xx). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.expose = options.expose ?? options.httpStatus < 500;
    this.details = options.details;
  }
}

type DomainErrorOptions = Pick<AppErrorOptions, 'details' | 'cause'>;

export class ValidationError extends AppError {
  readonly fieldErrors?: FieldErrors;

  constructor(
    message = 'Некорректные данные',
    options: DomainErrorOptions & { fieldErrors?: FieldErrors } = {},
  ) {
    super(message, { ...options, code: 'VALIDATION_ERROR', httpStatus: 400 });
    this.fieldErrors = options.fieldErrors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Требуется вход в систему', options: DomainErrorOptions = {}) {
    super(message, { ...options, code: 'UNAUTHORIZED', httpStatus: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Недостаточно прав', options: DomainErrorOptions = {}) {
    super(message, { ...options, code: 'FORBIDDEN', httpStatus: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Не найдено', options: DomainErrorOptions = {}) {
    super(message, { ...options, code: 'NOT_FOUND', httpStatus: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Конфликт данных', options: DomainErrorOptions = {}) {
    super(message, { ...options, code: 'CONFLICT', httpStatus: 409 });
  }
}

/** Инфраструктурная ошибка: сообщение не раскрывается клиенту. */
export class InternalError extends AppError {
  constructor(message = 'Внутренняя ошибка сервера', options: DomainErrorOptions = {}) {
    super(message, { ...options, code: 'INTERNAL_ERROR', httpStatus: 500, expose: false });
  }
}
