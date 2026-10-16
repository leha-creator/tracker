import { ValidationError } from '@/shared/errors/app-error';

import { transliterate } from '@/shared/text';

export const TASK_KEY_MIN_LENGTH = 2;
export const TASK_KEY_MAX_LENGTH = 10;
/** Ключ задач пространства: латинская буква, затем латинские буквы и цифры (`TSK`, `WEB2`). */
export const TASK_KEY_PATTERN = /^[A-Z][A-Z0-9]+$/;
/** Длина ключа, который предлагается из названия. */
const SUGGESTED_MAX_LENGTH = 4;
/** Ключ по умолчанию, если из названия ничего не получилось. */
const FALLBACK_KEY = 'WS';

/** Ключ в каноническом виде: без пробелов по краям, в верхнем регистре. */
export function normalizeTaskKey(value: string): string {
  return value.trim().toUpperCase();
}

/** Описание ошибки ключа (уже нормализованного) или null, если ключ допустим. */
export function taskKeyProblem(key: string): string | null {
  if (key.length < TASK_KEY_MIN_LENGTH || key.length > TASK_KEY_MAX_LENGTH) {
    return `Ключ — от ${TASK_KEY_MIN_LENGTH} до ${TASK_KEY_MAX_LENGTH} символов`;
  }
  if (!TASK_KEY_PATTERN.test(key)) {
    return 'Только латинские буквы и цифры, первая — буква';
  }
  return null;
}

export function validateTaskKey(value: string): string {
  const key = normalizeTaskKey(value);
  const problem = taskKeyProblem(key);
  if (problem) throw new ValidationError(problem, { fieldErrors: { taskKey: [problem] } });
  return key;
}

/**
 * Ключ из названия: инициалы слов («Отдел продаж» → `OP`) или первые буквы одного слова
 * («Маркетинг» → `MAR`). Всегда допустим по `taskKeyProblem`.
 */
export function suggestTaskKey(name: string): string {
  const words = transliterate(name)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  let key =
    words.length >= 2
      ? words.map((word) => word[0]).join('')
      : (words[0] ?? '').slice(0, SUGGESTED_MAX_LENGTH - 1);
  if (key === '') return FALLBACK_KEY;
  if (!/^[A-Z]/.test(key)) key = `W${key}`;
  key = key.slice(0, SUGGESTED_MAX_LENGTH);
  return key.length < TASK_KEY_MIN_LENGTH ? `${key}X` : key;
}

/** Вариант ключа при конфликте: `TSK` → `TSK2`, `TSK3`… с сохранением максимальной длины. */
export function taskKeyWithSuffix(key: string, attempt: number): string {
  const suffix = String(attempt + 1);
  return `${key.slice(0, TASK_KEY_MAX_LENGTH - suffix.length)}${suffix}`;
}
