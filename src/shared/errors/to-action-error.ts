import 'server-only';

import type { ActionFailure, ActionSuccess } from '@/shared/types';

import { normalizeError } from './normalize-error';

/** Успешный результат Server Action. */
export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

/** Преобразует пойманную ошибку в `ActionFailure` без утечки стектрейса клиенту. */
export function toActionError(
  error: unknown,
  context: Record<string, unknown> = {},
): ActionFailure {
  return { ok: false, error: normalizeError(error, context).body };
}
