/** Фото профиля: до 2 МБ, только картинки, которые безопасно показывать в браузере. */
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
/** Атрибут `accept` поля выбора файла. */
export const AVATAR_ACCEPT = AVATAR_CONTENT_TYPES.join(',');
/** Сколько первых байт читать для проверки сигнатуры. */
export const AVATAR_SIGNATURE_BYTES = 16;
export const AVATAR_UPLOAD_TTL_SECONDS = 5 * 60;
export const AVATAR_DOWNLOAD_TTL_SECONDS = 10 * 60;

const AVATAR_URL_PATTERN = /^\/api\/users\/[^/?#]+\/avatar(\?v=[\w-]+)?$/;

export function isAvatarContentType(value: string): value is AvatarContentType {
  return (AVATAR_CONTENT_TYPES as readonly string[]).includes(value);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/** Тип картинки по первым байтам; не PNG, JPEG или WebP — null. */
export function detectImageType(bytes: Uint8Array): AvatarContentType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

const EXTENSIONS: Record<AvatarContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Ключ фото в хранилище: префикс пользователя, случайный id и расширение по типу (тип нужен
 * при выдаче ссылки). Имени файла от пользователя в ключе нет.
 */
export function avatarStorageKey(
  userId: string,
  uploadId: string,
  contentType: AvatarContentType,
): string {
  return `users/${userId}/avatar/${uploadId}.${EXTENSIONS[contentType]}`;
}

/** Тип фото по расширению ключа; неизвестное расширение — null. */
export function avatarContentTypeOfKey(key: string): AvatarContentType | null {
  const extension = key.slice(key.lastIndexOf('.') + 1);
  const entry = Object.entries(EXTENSIONS).find(([, value]) => value === extension);
  return entry ? (entry[0] as AvatarContentType) : null;
}

/** Адрес фото в приложении; `version` меняется при замене — браузер не покажет старое из кеша. */
export function avatarUrl(userId: string, version: string): string {
  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${version}`;
}

/**
 * Адрес фото выдан приложением. `User.image` можно поменять и через эндпоинт Better Auth, поэтому
 * чужие адреса (внешние трекеры) не показываем.
 */
export function isAvatarUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && AVATAR_URL_PATTERN.test(value);
}
