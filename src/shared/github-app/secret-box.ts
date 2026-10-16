import 'server-only';

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** Контекст HKDF: ключ шифрования не совпадает с ключами Better Auth от того же секрета. */
const HKDF_INFO = 'tasker:github-app-config';
const VERSION = 'v1';

function encryptionKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), HKDF_INFO, 32));
}

/** AES-256-GCM: `v1.<iv>.<tag>.<шифротекст>` (base64url). */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Расшифровка; подмена или другой секрет — исключение (GCM проверяет тег). */
export function decryptSecret(sealed: string, secret: string): string {
  const [version, iv, tag, data, extra] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || data === undefined || extra !== undefined) {
    throw new Error('Неизвестный формат зашифрованного значения');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(secret),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
