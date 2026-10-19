import type { NextRequest } from 'next/server';

import { sendDueReminders } from '@/modules/tasks';
import { getEnv } from '@/shared/env';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { cronJson, isCronAuthorized } from '../cron-auth';

const log = createLogger('api.cron.reminders');

/**
 * Напоминания о сроке: раз в день вызывает планировщик (systemd-таймер tasker-reminders) с
 * `Authorization: Bearer ${CRON_SECRET}`. Без CRON_SECRET эндпоинта нет (404). proxy `/api`
 * не трогает; сессии здесь нет — доверие только секрету.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const env = getEnv();
  if (!env.CRON_SECRET) return new Response('Not Found', { status: 404 });

  if (!isCronAuthorized(request.headers.get('authorization'), env.CRON_SECRET)) {
    // Значение заголовка не логируем.
    log.warn('[cron.reminders] unauthorized');
    return cronJson(401, { error: 'unauthorized' });
  }

  try {
    const result = await sendDueReminders({ now: new Date(), timeZone: env.REMINDERS_TIMEZONE });
    return cronJson(200, { result });
  } catch (error) {
    return toErrorResponse(error, { route: 'POST /api/cron/reminders' });
  }
}
