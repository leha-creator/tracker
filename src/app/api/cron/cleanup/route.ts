import type { NextRequest } from 'next/server';

import { purgeExpiredAuditEvents } from '@/modules/audit';
import { getEnv } from '@/shared/env';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { purgeExpiredRateLimits } from '@/shared/rate-limit';

import { cronJson, isCronAuthorized } from '../cron-auth';

const log = createLogger('api.cron.cleanup');

/**
 * Ежедневная очистка: события журнала старше AUDIT_RETENTION_DAYS и истёкшие счётчики лимитов
 * Server Actions. Вызывает планировщик (systemd-таймер tasker-cleanup) с
 * `Authorization: Bearer ${CRON_SECRET}`; без CRON_SECRET эндпоинта нет (404). Повторный запуск
 * безопасен.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const env = getEnv();
  if (!env.CRON_SECRET) return new Response('Not Found', { status: 404 });

  if (!isCronAuthorized(request.headers.get('authorization'), env.CRON_SECRET)) {
    // Значение заголовка не логируем.
    log.warn('[cron.cleanup] unauthorized');
    return cronJson(401, { error: 'unauthorized' });
  }

  try {
    const now = new Date();
    const audit = await purgeExpiredAuditEvents({ now, retentionDays: env.AUDIT_RETENTION_DAYS });
    const rateLimitDeleted = await purgeExpiredRateLimits(now);
    const result = {
      auditDeleted: audit.deleted,
      auditCutoff: audit.cutoff.toISOString(),
      rateLimitDeleted,
    };
    log.info(result, '[cron.cleanup]');
    return cronJson(200, { result });
  } catch (error) {
    return toErrorResponse(error, { route: 'POST /api/cron/cleanup' });
  }
}
