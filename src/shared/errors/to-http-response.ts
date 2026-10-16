import 'server-only';

import { RateLimitError } from './app-error';
import { normalizeError } from './normalize-error';

/**
 * Ответ Route Handler с ошибкой: `{ error: { code, message, fieldErrors? } }` и HTTP-статус.
 * Для RateLimitError — заголовок Retry-After (секунды).
 */
export function toErrorResponse(error: unknown, context: Record<string, unknown> = {}): Response {
  const { httpStatus, body } = normalizeError(error, context);
  const headers =
    error instanceof RateLimitError
      ? { 'Retry-After': String(error.retryAfterSeconds) }
      : undefined;
  return Response.json({ error: body }, { status: httpStatus, headers });
}
