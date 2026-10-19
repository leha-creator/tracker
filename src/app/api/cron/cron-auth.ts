import { createHash, timingSafeEqual } from 'node:crypto';

/** Ответ эндпоинта планировщика: JSON без кеширования. */
export function cronJson(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * `Authorization: Bearer ${CRON_SECRET}` — общая проверка эндпоинтов /api/cron/*. Сравнение за
 * постоянное время: хеши уравнивают длину (timingSafeEqual требует буферы одной длины, а
 * сравнение длин раскрывало бы длину секрета).
 */
export function isCronAuthorized(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]!), digest(secret));
}
