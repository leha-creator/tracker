import 'server-only';

import { createLogger } from '@/shared/logger';

import { prisma } from './prisma';

const log = createLogger('db');

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
}

/** Проверка доступности БД через `SELECT 1`. Не бросает исключений. */
export async function checkDatabase(): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  log.debug('[checkDatabase] start');
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Math.round(performance.now() - startedAt);
    log.debug({ latencyMs }, '[checkDatabase] ok');
    return { ok: true, latencyMs };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    log.error({ err: error, latencyMs }, '[checkDatabase] database is unavailable');
    return { ok: false, latencyMs };
  }
}
