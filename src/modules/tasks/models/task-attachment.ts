import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';

/** Максимальный размер одного файла. */
export const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024;
/** Максимум файлов в блоке «Вложения» задачи. */
export const TASK_ATTACHMENTS_LIMIT = 20;
/** Максимум файлов в одном комментарии. */
export const COMMENT_ATTACHMENTS_LIMIT = 10;
/** Срок presigned POST для загрузки. */
export const ATTACHMENT_UPLOAD_TTL_SECONDS = 5 * 60;
/** Срок presigned GET: ссылку открывают сразу после редиректа. */
export const ATTACHMENT_DOWNLOAD_TTL_SECONDS = 60;
/** Неподтверждённые загрузки и неотправленные черновики старше этого срока удаляются. */
export const ATTACHMENT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Сколько первых байт файла читается для проверки сигнатуры картинки. */
export const ATTACHMENT_SIGNATURE_BYTES = 16;

const FILE_NAME_MAX_LENGTH = 200;
const EXTENSION_MAX_LENGTH = 10;

export const ATTACHMENT_TARGETS = ['task', 'comment'] as const;
export type AttachmentTarget = (typeof ATTACHMENT_TARGETS)[number];

/** Категория файла — для иконки в интерфейсе. */
export type AttachmentKind =
  'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'text' | 'archive';

interface AttachmentTypeInfo {
  contentType: string;
  kind: AttachmentKind;
  /** Показывается миниатюрой и открывается в браузере (`inline`). */
  previewable: boolean;
}

/** Allowlist: расширение → MIME. Тип от браузера не используется. */
const ATTACHMENT_TYPES: Record<string, AttachmentTypeInfo> = {
  png: { contentType: 'image/png', kind: 'image', previewable: true },
  jpg: { contentType: 'image/jpeg', kind: 'image', previewable: true },
  jpeg: { contentType: 'image/jpeg', kind: 'image', previewable: true },
  gif: { contentType: 'image/gif', kind: 'image', previewable: true },
  webp: { contentType: 'image/webp', kind: 'image', previewable: true },
  // SVG может содержать скрипты — только скачивание.
  svg: { contentType: 'image/svg+xml', kind: 'image', previewable: false },
  pdf: { contentType: 'application/pdf', kind: 'pdf', previewable: false },
  txt: { contentType: 'text/plain', kind: 'text', previewable: false },
  md: { contentType: 'text/markdown', kind: 'text', previewable: false },
  csv: { contentType: 'text/csv', kind: 'spreadsheet', previewable: false },
  json: { contentType: 'application/json', kind: 'text', previewable: false },
  zip: { contentType: 'application/zip', kind: 'archive', previewable: false },
  doc: { contentType: 'application/msword', kind: 'document', previewable: false },
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'document',
    previewable: false,
  },
  odt: {
    contentType: 'application/vnd.oasis.opendocument.text',
    kind: 'document',
    previewable: false,
  },
  xls: { contentType: 'application/vnd.ms-excel', kind: 'spreadsheet', previewable: false },
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'spreadsheet',
    previewable: false,
  },
  ods: {
    contentType: 'application/vnd.oasis.opendocument.spreadsheet',
    kind: 'spreadsheet',
    previewable: false,
  },
  ppt: { contentType: 'application/vnd.ms-powerpoint', kind: 'presentation', previewable: false },
  pptx: {
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    kind: 'presentation',
    previewable: false,
  },
  odp: {
    contentType: 'application/vnd.oasis.opendocument.presentation',
    kind: 'presentation',
    previewable: false,
  },
};

/** Значение `accept` для `<input type="file">`. */
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((extension) => `.${extension}`)
  .join(',');

/** Расширение в нижнем регистре без точки; `null` — расширения нет. */
export function fileExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * Имя файла для показа и `Content-Disposition`: без пути, управляющих символов и кавычек,
 * в NFC, не длиннее 200 символов (расширение сохраняется).
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    throw new ValidationError('Некорректное имя файла');
  }

  const chars = Array.from(cleaned);
  if (chars.length <= FILE_NAME_MAX_LENGTH) return cleaned;

  const extension = fileExtension(cleaned);
  const suffix = extension && extension.length <= EXTENSION_MAX_LENGTH ? `.${extension}` : '';
  const stem = Array.from(suffix ? cleaned.slice(0, -suffix.length) : cleaned);
  return (
    stem
      .slice(0, FILE_NAME_MAX_LENGTH - suffix.length)
      .join('')
      .trimEnd() + suffix
  );
}

/** Тип файла по расширению из allowlist. */
export function findAttachmentType(fileName: string): AttachmentTypeInfo | null {
  const extension = fileExtension(fileName);
  return extension !== null && Object.hasOwn(ATTACHMENT_TYPES, extension)
    ? (ATTACHMENT_TYPES[extension] ?? null)
    : null;
}

export function resolveAttachmentType(fileName: string): AttachmentTypeInfo {
  const type = findAttachmentType(fileName);
  if (!type) throw new ValidationError('Такой тип файла нельзя прикрепить');
  return type;
}

/** Тип по сохранённому MIME (для записей из БД). */
export function attachmentTypeOf(contentType: string): AttachmentTypeInfo {
  return (
    Object.values(ATTACHMENT_TYPES).find((type) => type.contentType === contentType) ?? {
      contentType,
      kind: 'document',
      previewable: false,
    }
  );
}

export function assertAttachmentSize(size: number): void {
  if (!Number.isInteger(size) || size < 1) {
    throw new ValidationError('Пустой файл нельзя прикрепить');
  }
  if (size > ATTACHMENT_MAX_SIZE) {
    throw new ValidationError(`Файл больше ${formatFileSize(ATTACHMENT_MAX_SIZE)}`);
  }
}

export function attachmentLimit(target: AttachmentTarget): number {
  return target === 'task' ? TASK_ATTACHMENTS_LIMIT : COMMENT_ATTACHMENTS_LIMIT;
}

/** `count` — уже прикреплённые файлы (вместе с незавершёнными загрузками). */
export function assertAttachmentLimit(count: number, target: AttachmentTarget): void {
  const limit = attachmentLimit(target);
  if (count >= limit) {
    throw new ValidationError(
      target === 'task'
        ? `К задаче можно прикрепить не больше ${limit} файлов`
        : `К комментарию можно приложить не больше ${limit} файлов`,
    );
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

const IMAGE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/gif': (bytes) => startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a')),
  'image/webp': (bytes) => startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8),
};

/** Нужна ли проверка сигнатуры: только для картинок, которые показываются в браузере. */
export function requiresSignatureCheck(contentType: string): boolean {
  return Object.hasOwn(IMAGE_SIGNATURES, contentType);
}

/** Первые байты файла соответствуют заявленной картинке. Для прочих типов — всегда true. */
export function matchesImageSignature(contentType: string, bytes: Uint8Array): boolean {
  const check = Object.hasOwn(IMAGE_SIGNATURES, contentType) ? IMAGE_SIGNATURES[contentType] : null;
  return check ? check(bytes) : true;
}

/** RFC 5987: процентная кодировка UTF-8, включая символы `'()*`. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Заголовок `Content-Disposition` с ASCII-именем для старых клиентов и `filename*` в UTF-8. */
export function contentDisposition(fileName: string, disposition: 'inline' | 'attachment'): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

/**
 * Ключ объекта в хранилище: префикс пространства и задачи + случайный `objectId`.
 * Имени файла в ключе нет — нет проблем с кодировкой и обходом путей.
 */
export function attachmentStorageKey(
  workspaceId: string,
  taskId: string,
  objectId: string,
): string {
  return `ws/${workspaceId}/tasks/${taskId}/${objectId}`;
}

const SIZE_FORMAT = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });

/** Размер для показа: `512 Б`, `1,5 КБ`, `25 МБ`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${SIZE_FORMAT.format(bytes / 1024)} КБ`;
  return `${SIZE_FORMAT.format(bytes / (1024 * 1024))} МБ`;
}

interface AttachmentActor {
  userId: string;
  role: WorkspaceRole;
}

interface AttachmentOwnership {
  /** null — загрузивший удалён. */
  uploaderId: string | null;
  target: AttachmentTarget;
  commentId: string | null;
}

/** Черновик формы комментария: файл загружен, комментарий ещё не отправлен. */
export function isCommentDraft(attachment: AttachmentOwnership): boolean {
  return attachment.target === 'comment' && attachment.commentId === null;
}

const isUploader = (attachment: AttachmentOwnership, actor: AttachmentActor) =>
  attachment.uploaderId !== null && attachment.uploaderId === actor.userId;

/** Черновик видит только загрузивший, остальные вложения — все участники. */
export function canViewAttachment(
  attachment: AttachmentOwnership,
  actor: AttachmentActor,
): boolean {
  return !isCommentDraft(attachment) || isUploader(attachment, actor);
}

/** Удалить файл может загрузивший или владелец пространства; черновик — только загрузивший. */
export function canDeleteAttachment(
  attachment: AttachmentOwnership,
  actor: AttachmentActor,
): boolean {
  if (isCommentDraft(attachment)) return isUploader(attachment, actor);
  return actor.role === 'owner' || isUploader(attachment, actor);
}

export function assertCanDeleteAttachment(
  attachment: AttachmentOwnership,
  actor: AttachmentActor,
): void {
  if (!canDeleteAttachment(attachment, actor)) {
    throw new ForbiddenError('Удалить файл может загрузивший его или владелец пространства');
  }
}

/** Комментарий не должен остаться пустым: без текста и без файлов. */
export function assertCanRemoveFromComment(comment: {
  bodyLength: number;
  attachmentsLeft: number;
}): void {
  if (comment.bodyLength === 0 && comment.attachmentsLeft === 0) {
    throw new ValidationError(
      'Это последний файл комментария без текста — удалите комментарий целиком',
    );
  }
}
