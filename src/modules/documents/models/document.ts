import { ConflictError, ValidationError } from '@/shared/errors/app-error';

import { formatBytes } from './document-type';

export const DOCUMENT_TITLE_MAX_LENGTH = 200;
/** Максимальная длина заметки в символах. */
export const NOTE_CONTENT_MAX_LENGTH = 200_000;
/** Максимум тегов у документа. */
export const DOCUMENT_TAGS_LIMIT = 10;
/** Максимум документов, привязанных к одной задаче. */
export const TASK_DOCUMENT_LINKS_LIMIT = 50;
/** Квота пространства по умолчанию, МБ (переопределяется DOCUMENTS_WORKSPACE_QUOTA_MB). */
export const DEFAULT_WORKSPACE_QUOTA_MB = 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Похоже ли значение на id сущности (uuid) — до запроса в БД. */
export function isDocumentEntityId(value: string): boolean {
  return UUID_RE.test(value);
}

function titleError(message: string): ValidationError {
  return new ValidationError(message, { fieldErrors: { title: [message] } });
}

/** Название документа: NFC, без пробелов по краям, одиночные пробелы внутри. */
export function normalizeDocumentTitle(raw: string): string {
  const title = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (title === '') throw titleError('Введите название');
  if (Array.from(title).length > DOCUMENT_TITLE_MAX_LENGTH) {
    throw titleError(`Название не длиннее ${DOCUMENT_TITLE_MAX_LENGTH} символов`);
  }
  return title;
}

/** Ключ поиска и сортировки по названию. */
export function documentTitleKey(title: string): string {
  return title.toLocaleLowerCase('ru');
}

/** Текст заметки: переводы строк `\n`, длина не больше лимита. */
export function normalizeNoteContent(raw: string): string {
  const content = raw.replace(/\r\n?/g, '\n');
  if (content.length > NOTE_CONTENT_MAX_LENGTH) {
    const message = `Заметка не длиннее ${NOTE_CONTENT_MAX_LENGTH.toLocaleString('ru')} символов`;
    throw new ValidationError(message, { fieldErrors: { content: [message] } });
  }
  return content;
}

/** Версия заметки при сохранении совпадает с текущей — иначе её уже изменил кто-то другой. */
export function assertNoteVersion(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new ConflictError('Документ изменили, пока вы его редактировали', {
      details: { expected, actual },
    });
  }
}

export function assertDocumentTagsLimit(count: number): void {
  if (count > DOCUMENT_TAGS_LIMIT) {
    throw new ValidationError(`У документа может быть не больше ${DOCUMENT_TAGS_LIMIT} тегов`);
  }
}

/** `count` — уже привязанные к задаче документы. */
export function assertTaskLinksLimit(count: number): void {
  if (count >= TASK_DOCUMENT_LINKS_LIMIT) {
    throw new ValidationError(
      `К задаче можно привязать не больше ${TASK_DOCUMENT_LINKS_LIMIT} документов`,
    );
  }
}

/** Квота хранилища пространства: занятое + новый файл не больше квоты. */
export function assertStorageQuota(input: {
  usedBytes: number;
  incomingBytes: number;
  quotaBytes: number;
}): void {
  const { usedBytes, incomingBytes, quotaBytes } = input;
  if (usedBytes + incomingBytes > quotaBytes) {
    const free = Math.max(0, quotaBytes - usedBytes);
    throw new ValidationError(
      `В хранилище пространства не хватает места: свободно ${formatBytes(free)}, ` +
        `файл — ${formatBytes(incomingBytes)}`,
    );
  }
}

/** Имя файла для скачивания заметки: название без символов путей + `.md`. */
export function noteExportFileName(title: string): string {
  const stem = title.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '_').trim() || 'document';
  return `${stem}.md`;
}
