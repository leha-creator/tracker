import 'server-only';

import { ZodError } from 'zod';

import { createLogger } from '@/shared/logger';
import type { ActionError } from '@/shared/types';

import { AppError, type FieldErrors } from './app-error';

const log = createLogger('errors');

export const INTERNAL_ERROR_MESSAGE = 'Внутренняя ошибка сервера';

export interface NormalizedError {
  httpStatus: number;
  body: ActionError;
}

function zodFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_form';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Приводит любую ошибку к публичному формату `{ code, message, fieldErrors? }` и логирует её.
 * Доменные ошибки (4xx) — WARN, неожиданные (5xx) — ERROR со стеком (только в логах, не в ответе).
 */
export function normalizeError(
  error: unknown,
  context: Record<string, unknown> = {},
): NormalizedError {
  if (error instanceof ZodError) {
    const fieldErrors = zodFieldErrors(error);
    log.warn({ ...context, code: 'VALIDATION_ERROR' }, '[normalizeError] validation failed');
    log.debug({ ...context, fieldErrors }, '[normalizeError] validation field errors');
    return {
      httpStatus: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Некорректные данные', fieldErrors },
    };
  }

  if (error instanceof AppError && error.expose) {
    const { fieldErrors } = error;
    log.warn(
      { ...context, code: error.code, message: error.message },
      '[normalizeError] domain error',
    );
    if (fieldErrors) {
      log.debug({ ...context, fieldErrors }, '[normalizeError] validation field errors');
    }
    return {
      httpStatus: error.httpStatus,
      body: { code: error.code, message: error.message, ...(fieldErrors ? { fieldErrors } : {}) },
    };
  }

  log.error({ ...context, err: error }, '[normalizeError] unexpected error');
  return {
    httpStatus: error instanceof AppError ? error.httpStatus : 500,
    body: { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE },
  };
}
