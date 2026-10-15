import type { ErrorCode, FieldErrors } from '@/shared/errors/app-error';

export interface ActionError {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
}

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; error: ActionError };

/** Результат Server Action: данные или ошибка в едином формате `{ code, message }`. */
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;
