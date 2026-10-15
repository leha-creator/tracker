import type { ActionFailure, ActionSuccess } from './action-result';

/**
 * Состояние формы для useActionState: успех с данными или ошибка вместе с введёнными значениями
 * (React сбрасывает поля формы после action — значения нужны, чтобы вернуть их в поля).
 */
export type FormState<T = null> =
  ActionSuccess<T> | (ActionFailure & { values: Record<string, string> }) | null;

export function formValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === 'string' ? value : ''];
    }),
  );
}
