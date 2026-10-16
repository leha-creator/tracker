import { ValidationError } from '@/shared/errors/app-error';

/** Максимальный размер одного файла в хранилище пространства. */
export const DOCUMENT_FILE_MAX_SIZE = 50 * 1024 * 1024;
/** Сколько байт текстового файла читается для просмотра. */
export const DOCUMENT_TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
/** Срок presigned POST для загрузки (файлы до 50 МБ). */
export const DOCUMENT_UPLOAD_TTL_SECONDS = 10 * 60;
/** Срок presigned GET: ссылку открывают сразу после редиректа. */
export const DOCUMENT_DOWNLOAD_TTL_SECONDS = 60;
/** Срок presigned GET для аудио и видео: перемотка повторяет Range-запросы к той же ссылке. */
export const DOCUMENT_MEDIA_TTL_SECONDS = 60 * 60;
/** Неподтверждённые загрузки старше этого срока удаляются. */
export const DOCUMENT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Сколько первых байт файла читается для проверки сигнатуры. */
export const DOCUMENT_SIGNATURE_BYTES = 16;

const FILE_NAME_MAX_LENGTH = 200;
const EXTENSION_MAX_LENGTH = 10;

/** Категория файла — для иконки и фильтра. */
export type DocumentFileKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'audio'
  | 'video'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive';

/** Как файл показывается в приложении; `null` — только карточка и скачивание. */
export type DocumentViewer =
  'image' | 'pdf' | 'markdown' | 'csv' | 'tsv' | 'json' | 'code' | 'audio' | 'video';

/** Просмотрщики, которым нужен текст файла (сервер читает его из хранилища). */
export const TEXT_VIEWERS = ['markdown', 'csv', 'tsv', 'json', 'code'] as const;
export type DocumentTextViewer = (typeof TEXT_VIEWERS)[number];

/** Просмотрщики, которым нужна ссылка на файл с `Content-Disposition: inline`. */
const INLINE_VIEWERS: readonly DocumentViewer[] = ['image', 'pdf', 'audio', 'video'];
const MEDIA_VIEWERS: readonly DocumentViewer[] = ['audio', 'video'];

type FileSignature = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf';

export interface DocumentFileType {
  extension: string;
  /** MIME для хранилища и ответа. HTML, XML и SVG никогда не отдаются как разметка. */
  contentType: string;
  kind: DocumentFileKind;
  viewer: DocumentViewer | null;
  /** Сигнатура, которую сервер проверяет после загрузки. */
  signature: FileSignature | null;
}

type TypeInfo = Omit<DocumentFileType, 'extension'>;

const text = (viewer: DocumentTextViewer, contentType = 'text/plain'): TypeInfo => ({
  contentType,
  kind: 'text',
  viewer,
  signature: null,
});

const download = (kind: DocumentFileKind, contentType: string): TypeInfo => ({
  contentType,
  kind,
  viewer: null,
  signature: null,
});

/** Allowlist: расширение → тип. Тип от браузера не используется. */
const DOCUMENT_TYPES: Record<string, TypeInfo> = {
  png: { contentType: 'image/png', kind: 'image', viewer: 'image', signature: 'png' },
  jpg: { contentType: 'image/jpeg', kind: 'image', viewer: 'image', signature: 'jpeg' },
  jpeg: { contentType: 'image/jpeg', kind: 'image', viewer: 'image', signature: 'jpeg' },
  gif: { contentType: 'image/gif', kind: 'image', viewer: 'image', signature: 'gif' },
  webp: { contentType: 'image/webp', kind: 'image', viewer: 'image', signature: 'webp' },
  // SVG может содержать скрипты — только скачивание.
  svg: download('image', 'image/svg+xml'),
  pdf: { contentType: 'application/pdf', kind: 'pdf', viewer: 'pdf', signature: 'pdf' },

  md: text('markdown', 'text/markdown'),
  markdown: text('markdown', 'text/markdown'),
  csv: text('csv', 'text/csv'),
  tsv: text('tsv', 'text/tab-separated-values'),
  json: text('json', 'application/json'),
  txt: text('code'),
  log: text('code'),
  // Разметка и код показываются только как исходный текст и хранятся как text/plain.
  html: text('code'),
  htm: text('code'),
  xml: text('code'),
  yaml: text('code'),
  yml: text('code'),
  toml: text('code'),
  ini: text('code'),
  ts: text('code'),
  tsx: text('code'),
  js: text('code'),
  jsx: text('code'),
  py: text('code'),
  go: text('code'),
  java: text('code'),
  kt: text('code'),
  rb: text('code'),
  php: text('code'),
  cs: text('code'),
  sql: text('code'),
  sh: text('code'),
  css: text('code'),

  mp3: { contentType: 'audio/mpeg', kind: 'audio', viewer: 'audio', signature: null },
  ogg: { contentType: 'audio/ogg', kind: 'audio', viewer: 'audio', signature: null },
  wav: { contentType: 'audio/wav', kind: 'audio', viewer: 'audio', signature: null },
  m4a: { contentType: 'audio/mp4', kind: 'audio', viewer: 'audio', signature: null },
  mp4: { contentType: 'video/mp4', kind: 'video', viewer: 'video', signature: null },
  webm: { contentType: 'video/webm', kind: 'video', viewer: 'video', signature: null },

  doc: download('document', 'application/msword'),
  docx: download(
    'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),
  odt: download('document', 'application/vnd.oasis.opendocument.text'),
  rtf: download('document', 'application/rtf'),
  xls: download('spreadsheet', 'application/vnd.ms-excel'),
  xlsx: download(
    'spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ),
  ods: download('spreadsheet', 'application/vnd.oasis.opendocument.spreadsheet'),
  ppt: download('presentation', 'application/vnd.ms-powerpoint'),
  pptx: download(
    'presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ),
  odp: download('presentation', 'application/vnd.oasis.opendocument.presentation'),
  zip: download('archive', 'application/zip'),
  '7z': download('archive', 'application/x-7z-compressed'),
  gz: download('archive', 'application/gzip'),
  tar: download('archive', 'application/x-tar'),
};

/** Значение `accept` для `<input type="file">`. */
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES)
  .map((extension) => `.${extension}`)
  .join(',');

/** Расширение в нижнем регистре без точки; `null` — расширения нет. */
export function fileExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

/** Тип по расширению из allowlist; `null` — тип не разрешён. */
export function findDocumentFileType(fileName: string): DocumentFileType | null {
  const extension = fileExtension(fileName);
  if (extension === null || !Object.hasOwn(DOCUMENT_TYPES, extension)) return null;
  const info = DOCUMENT_TYPES[extension];
  return info ? { extension, ...info } : null;
}

export function resolveDocumentFileType(fileName: string): DocumentFileType {
  const type = findDocumentFileType(fileName);
  if (!type) throw new ValidationError('Такой тип файла нельзя загрузить в документы');
  return type;
}

/**
 * Тип сохранённого файла по расширению из БД. Неизвестное расширение (allowlist сузили) —
 * только скачивание.
 */
export function documentFileTypeOf(extension: string, contentType: string): DocumentFileType {
  const info = Object.hasOwn(DOCUMENT_TYPES, extension) ? DOCUMENT_TYPES[extension] : undefined;
  return info
    ? { extension, ...info }
    : { extension, contentType, kind: 'document', viewer: null, signature: null };
}

/** Расширения allowlist заданных категорий — для фильтра списка по виду. */
export function extensionsOfKinds(kinds: readonly DocumentFileKind[]): string[] {
  return Object.entries(DOCUMENT_TYPES)
    .filter(([, info]) => kinds.includes(info.kind))
    .map(([extension]) => extension);
}

export function isTextViewer(viewer: DocumentViewer | null): viewer is DocumentTextViewer {
  return viewer !== null && (TEXT_VIEWERS as readonly string[]).includes(viewer);
}

/** Можно ли отдать файл с `Content-Disposition: inline`. */
export function isInlineViewable(type: DocumentFileType): boolean {
  return type.viewer !== null && INLINE_VIEWERS.includes(type.viewer);
}

/** Срок ссылки на файл: для медиа — дольше, чтобы работала перемотка. */
export function downloadTtlSeconds(type: DocumentFileType, inline: boolean): number {
  return inline && type.viewer !== null && MEDIA_VIEWERS.includes(type.viewer)
    ? DOCUMENT_MEDIA_TTL_SECONDS
    : DOCUMENT_DOWNLOAD_TTL_SECONDS;
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

/** Название документа по имени файла: без расширения. */
export function titleFromFileName(fileName: string): string {
  const extension = fileExtension(fileName);
  const stem = extension ? fileName.slice(0, -(extension.length + 1)) : fileName;
  return stem.trim() || fileName;
}

export function assertDocumentFileSize(size: number): void {
  if (!Number.isInteger(size) || size < 1) {
    throw new ValidationError('Пустой файл нельзя загрузить');
  }
  if (size > DOCUMENT_FILE_MAX_SIZE) {
    throw new ValidationError(`Файл больше ${formatBytes(DOCUMENT_FILE_MAX_SIZE)}`);
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (value: string) => Array.from(value, (char) => char.charCodeAt(0));

const SIGNATURES: Record<FileSignature, (bytes: Uint8Array) => boolean> = {
  png: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  gif: (bytes) => startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a')),
  webp: (bytes) => startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8),
  pdf: (bytes) => startsWith(bytes, ascii('%PDF-')),
};

/** Первые байты файла соответствуют типу. Для типов без сигнатуры — всегда true. */
export function matchesFileSignature(type: DocumentFileType, bytes: Uint8Array): boolean {
  return type.signature ? SIGNATURES[type.signature](bytes) : true;
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
 * Ключ объекта: префикс пространства — «своё хранилище» пространства — и случайный `objectId`
 * (ключ нужен до вставки строки документа). Имени файла в ключе нет — нет проблем с кодировкой
 * и обходом путей.
 */
export function documentStorageKey(workspaceId: string, objectId: string): string {
  return `ws/${workspaceId}/docs/${objectId}`;
}

const SIZE_FORMAT = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });

/** Размер для показа: `512 Б`, `1,5 КБ`, `25 МБ`, `1 ГБ`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${SIZE_FORMAT.format(bytes / 1024)} КБ`;
  if (bytes < 1024 ** 3) return `${SIZE_FORMAT.format(bytes / 1024 ** 2)} МБ`;
  return `${SIZE_FORMAT.format(bytes / 1024 ** 3)} ГБ`;
}
