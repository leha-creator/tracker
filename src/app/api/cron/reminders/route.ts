import { createHash, timingSafeEqual } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { sendDueReminders } from '@/modules/tasks';
import { getEnv } from '@/shared/env';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.cron.reminders');

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Сравнение секрета за постоянное время. Хеши уравнивают длину: timingSafeEqual требует буферы
 * одной длины, а сравнение длин раскрывало бы длину секрета.
 */
function isAuthorized(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]!), digest(secret));
}

/**
 * Напоминания о сроке: раз в день вызывает планировщик (systemd-таймер tasker-reminders) с
 * `Authorization: Bearer ${CRON_SECRET}`. Без CRON_SECRET эндпоинта нет (404). proxy `/api`
 * не трогает; сессии здесь нет — доверие только секрету.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const env = getEnv();
  if (!env.CRON_SECRET) return new Response('Not Found', { status: 404 });

  if (!isAuthorized(request.headers.get('authorization'), env.CRON_SECRET)) {
    // Значение заголовка не логируем.
    log.warn('[cron.reminders] unauthorized');
    return json(401, { error: 'unauthorized' });
  }

  try {
    const result = await sendDueReminders({ now: new Date(), timeZone: env.REMINDERS_TIMEZONE });
    return json(200, { result });
  } catch (error) {
    return toErrorResponse(error, { route: 'POST /api/cron/reminders' });
  }
}
