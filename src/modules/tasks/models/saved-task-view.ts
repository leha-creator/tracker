import { ValidationError } from '@/shared/errors/app-error';

import {
  parseTaskListParams,
  serializeTaskListParams,
  type TaskListScope,
} from './task-list-query';

/**
 * Сохранённые фильтры списка задач: личные, у каждой области (список пространства, список
 * проекта, «Мои задачи») свои. Хранятся канонические параметры URL без страницы.
 */

/** Область фильтра совпадает с областью списка. */
export type SavedTaskViewScope = TaskListScope;

export const SAVED_VIEW_NAME_MAX_LENGTH = 40;
/** Максимум фильтров пользователя в одной области. */
export const SAVED_VIEWS_PER_SCOPE = 20;
export const SAVED_VIEW_PARAMS_MAX_LENGTH = 2000;

function nameError(message: string): ValidationError {
  return new ValidationError(message, { fieldErrors: { name: [message] } });
}

/** Имя фильтра: NFC, без пробелов по краям, одиночные пробелы внутри, 1–40 символов. */
export function normalizeViewName(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name === '') throw nameError('Введите название фильтра');
  if (/[\u0000-\u001f\u007f]/.test(name)) throw nameError('Недопустимые символы в названии');
  if (Array.from(name).length > SAVED_VIEW_NAME_MAX_LENGTH) {
    throw nameError(`Название не длиннее ${SAVED_VIEW_NAME_MAX_LENGTH} символов`);
  }
  return name;
}

/** Ключ уникальности имени в области: без учёта регистра (как индекс `lower(name)` в БД). */
export function viewNameKey(name: string): string {
  return name.toLowerCase();
}

export function assertCanCreateView(count: number): void {
  if (count >= SAVED_VIEWS_PER_SCOPE) {
    throw new ValidationError(`Можно сохранить не больше ${SAVED_VIEWS_PER_SCOPE} фильтров`);
  }
}

/**
 * Параметры списка → канонический вид: разбор и сериализация как у страницы, без номера
 * страницы. Чужие и некорректные параметры отбрасываются; совпадение строк — тот же фильтр.
 */
export function canonicalViewParams(rawParams: string, scope: SavedTaskViewScope): string {
  const search = new URLSearchParams(rawParams.startsWith('?') ? rawParams.slice(1) : rawParams);
  const raw: Record<string, string> = {};
  for (const [key, value] of search) raw[key] ??= value;
  const query = parseTaskListParams(raw, scope);
  const params = serializeTaskListParams({ ...query, page: 1 }, scope);
  if (params.length > SAVED_VIEW_PARAMS_MAX_LENGTH) {
    throw new ValidationError('Слишком длинный фильтр');
  }
  return params;
}
