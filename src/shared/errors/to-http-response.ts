import 'server-only';

import { normalizeError } from './normalize-error';

/** Ответ Route Handler с ошибкой: `{ error: { code, message, fieldErrors? } }` и HTTP-статус. */
export function toErrorResponse(error: unknown, context: Record<string, unknown> = {}): Response {
  const { httpStatus, body } = normalizeError(error, context);
  return Response.json({ error: body }, { status: httpStatus });
}
