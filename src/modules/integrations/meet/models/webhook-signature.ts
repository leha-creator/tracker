import { createHmac, timingSafeEqual } from 'node:crypto';

// Подпись вебхука meet (docs/meet.md): `X-Meet-Signature: t=<Unix-секунды>,v1=<hex>`, где
// v1 = HMAC-SHA256(secret, "<t>." + сырое тело). Метка времени защищает от повтора старого запроса.

/** Допустимое расхождение `t` с часами tasker. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type WebhookSignatureError = 'malformed' | 'stale' | 'mismatch';

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) return null;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') {
      if (!/^\d{1,12}$/.test(value)) return null;
      timestamp = Number(value);
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }
  return timestamp === null || signatures.length === 0 ? null : { timestamp, signatures };
}

/** Подпись для тела и метки времени — для тестов и для документации контракта. */
export function signWebhookBody(body: string, secret: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Проверяет `X-Meet-Signature` по сырому телу. `now` — Unix-секунды. Несколько `v1` допускаются
 * (ротация секрета на стороне meet): подходит любая.
 */
export function verifyWebhookSignature(
  body: string,
  header: string | null,
  secret: string,
  now: number,
): { ok: true } | { ok: false; error: WebhookSignatureError } {
  const parsed = header ? parseHeader(header) : null;
  if (!parsed) return { ok: false, error: 'malformed' };
  if (Math.abs(now - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, error: 'stale' };
  }
  const expected = createHmac('sha256', secret)
    .update(`${parsed.timestamp}.${body}`, 'utf8')
    .digest();
  const matches = parsed.signatures.some((signature) => {
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  return matches ? { ok: true } : { ok: false, error: 'mismatch' };
}
