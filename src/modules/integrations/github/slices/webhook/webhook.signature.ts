import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getEnv } from '@/shared/env';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Проверка `X-Hub-Signature-256`: HMAC-SHA256 сырого тела на секрете вебхука, сравнение за
 * постоянное время. Тело — ровно те байты, что пришли (до JSON.parse).
 */
export function verifyWebhookSignature(
  body: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header?.startsWith(SIGNATURE_PREFIX)) return false;
  const received = Buffer.from(header.slice(SIGNATURE_PREFIX.length), 'hex');
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest();
  // Другая длина (в т.ч. не-hex мусор → пустой буфер) — сразу отказ: timingSafeEqual бросил бы.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Подпись вебхука на секрете из GITHUB_WEBHOOK_SECRET; без настройки — всегда false. */
export function verifyGithubWebhookSignature(body: string, header: string | null): boolean {
  const secret = getEnv().GITHUB_WEBHOOK_SECRET;
  return secret !== undefined && verifyWebhookSignature(body, header, secret);
}
