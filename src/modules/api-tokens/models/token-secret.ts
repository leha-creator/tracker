import { createHash, randomBytes } from 'node:crypto';

import { API_TOKEN_DISPLAY_PREFIX_LENGTH, API_TOKEN_PREFIX } from './api-token';

// Только для сервера: node:crypto не попадает в клиентский бандл (client.ts этот файл не импортирует).

export interface GeneratedApiToken {
  /** Открытый токен — показывается пользователю один раз. */
  token: string;
  prefix: string;
  hash: string;
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateApiToken(): GeneratedApiToken {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    token,
    prefix: token.slice(0, API_TOKEN_DISPLAY_PREFIX_LENGTH),
    hash: hashApiToken(token),
  };
}
