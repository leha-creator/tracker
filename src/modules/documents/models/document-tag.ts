import { ValidationError } from '@/shared/errors/app-error';

export const TAG_NAME_MAX_LENGTH = 32;
/** Максимум тегов в пространстве. */
export const WORKSPACE_TAGS_LIMIT = 200;

/** Палитра тегов — те же ключи, что у статусов проектов (общие классы цветов в UI). */
export const DOCUMENT_TAG_COLORS = ['gray', 'blue', 'green', 'amber', 'red', 'violet'] as const;
export type DocumentTagColor = (typeof DOCUMENT_TAG_COLORS)[number];
export const DEFAULT_TAG_COLOR: DocumentTagColor = 'gray';

export function parseTagColor(value: string | null | undefined): DocumentTagColor {
  return DOCUMENT_TAG_COLORS.find((color) => color === value) ?? DEFAULT_TAG_COLOR;
}

function nameError(message: string): ValidationError {
  return new ValidationError(message, { fieldErrors: { name: [message] } });
}

/** Имя тега: NFC, без `#` в начале, без пробелов по краям, одиночные пробелы внутри. */
export function normalizeTagName(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ');
  if (name === '') throw nameError('Введите название тега');
  if (/[\u0000-\u001f\u007f,]/.test(name)) {
    throw nameError('Название тега не может содержать запятую');
  }
  if (Array.from(name).length > TAG_NAME_MAX_LENGTH) {
    throw nameError(`Название тега не длиннее ${TAG_NAME_MAX_LENGTH} символов`);
  }
  return name;
}

/** Ключ уникальности тега в пространстве: без учёта регистра. */
export function tagNameKey(name: string): string {
  return name.toLocaleLowerCase('ru');
}

export function assertWorkspaceTagsLimit(count: number): void {
  if (count >= WORKSPACE_TAGS_LIMIT) {
    throw new ValidationError(`В пространстве может быть не больше ${WORKSPACE_TAGS_LIMIT} тегов`);
  }
}
