import 'server-only';

import { checkDatabase, type HealthCheckResult } from '@/shared/db';
import { createLogger } from '@/shared/logger';
import { checkStorage } from '@/shared/storage';

const log = createLogger('health');

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    db: HealthCheckResult;
    storage: HealthCheckResult;
  };
}

/** Проверяет инфраструктурные зависимости параллельно. */
export async function checkHealth(): Promise<HealthReport> {
  log.debug('[checkHealth] start');
  const [db, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const status = db.ok && storage.ok ? 'ok' : 'degraded';
  const report: HealthReport = { status, checks: { db, storage } };

  if (status === 'ok') {
    log.info(report, '[checkHealth] healthy');
  } else {
    log.warn(report, '[checkHealth] degraded');
  }
  return report;
}
