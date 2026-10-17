import { STATUS_COLORS, type StatusColor } from '@/modules/projects/client';
import { ValidationError } from '@/shared/errors/app-error';

/**
 * Метки задач пространства: как теги документов — имя без учёта регистра и цвет из общей палитры
 * статусов (одни и те же классы цветов в UI).
 */

export const TASK_LABEL_NAME_MAX_LENGTH = 32;
/** Максимум меток у одной задачи. */
export const TASK_LABELS_PER_TASK = 10;
/** Максимум меток в пространстве. */
export const TASK_LABELS_PER_WORKSPACE = 100;
/** Меток на карточке доски; остальные — «+N». */
export const TASK_LABELS_ON_CARD = 3;

export const TASK_LABEL_COLORS = STATUS_COLORS;
export type TaskLabelColor = StatusColor;
export const DEFAULT_TASK_LABEL_COLOR: TaskLabelColor = 'gray';

export function parseLabelColor(value: string | null | undefined): TaskLabelColor {
  return TASK_LABEL_COLORS.find((color) => color === value) ?? DEFAULT_TASK_LABEL_COLOR;
}

function nameError(message: string): ValidationError {
  return new ValidationError(message, { fieldErrors: { name: [message] } });
}

/** Имя метки: NFC, без пробелов по краям, одиночные пробелы внутри, без запятых. */
export function normalizeLabelName(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name === '') throw nameError('Введите название метки');
  if (/[\u0000-\u001f\u007f,]/.test(name)) {
    throw nameError('Название метки не может содержать запятую');
  }
  if (Array.from(name).length > TASK_LABEL_NAME_MAX_LENGTH) {
    throw nameError(`Название метки не длиннее ${TASK_LABEL_NAME_MAX_LENGTH} символов`);
  }
  return name;
}

/** Ключ уникальности метки в пространстве: без учёта регистра. */
export function labelNameKey(name: string): string {
  return name.toLocaleLowerCase('ru');
}

export function assertCanCreateLabel(workspaceCount: number): void {
  if (workspaceCount >= TASK_LABELS_PER_WORKSPACE) {
    throw new ValidationError(
      `В пространстве может быть не больше ${TASK_LABELS_PER_WORKSPACE} меток`,
    );
  }
}

export function assertCanAssignLabels(count: number): void {
  if (count > TASK_LABELS_PER_TASK) {
    throw new ValidationError(`У задачи может быть не больше ${TASK_LABELS_PER_TASK} меток`);
  }
}

/** Что изменилось в наборе меток задачи: добавленные и снятые (в порядке входных списков). */
export function diffLabels<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): { added: T[]; removed: T[] } {
  const beforeIds = new Set(before.map((label) => label.id));
  const afterIds = new Set(after.map((label) => label.id));
  return {
    added: after.filter((label) => !beforeIds.has(label.id)),
    removed: before.filter((label) => !afterIds.has(label.id)),
  };
}
