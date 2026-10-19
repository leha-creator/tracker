import 'server-only';

import { prisma } from '@/shared/db';
import { RateLimitError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { buildRateLimitChecks, type RateLimitCheck, type RateLimitSubject } from './keys';
import type { RateLimitAction, RateLimitRule } from './rules';

const log = createLogger('rate-limit');

/** Доля вызовов, после которых в фоне удаляются истёкшие счётчики. */
const CLEANUP_PROBABILITY = 1 / 50;

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  /** Секунды до конца окна. */
  retryAfterSeconds: number;
}

interface ConsumeRow {
  count: number;
  retryAfter: number;
}

let unknownIpWarned = false;

/** Удаляет истёкшие счётчики. Возвращает число удалённых — для /api/cron/cleanup. */
export async function purgeExpiredRateLimits(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.actionRateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}

function cleanupExpired(): void {
  purgeExpiredRateLimits()
    .then((count) => log.debug({ count }, '[rateLimit.cleanup] expired counters removed'))
    .catch((error: unknown) => log.error({ err: error }, '[rateLimit.cleanup] failed'));
}

/**
 * Засчитывает попытку по ключу и возвращает решение. Один атомарный upsert: окно истекло —
 * счётчик начинается заново, иначе увеличивается (фиксированное окно). Время — в UTC, как пишет
 * Prisma в `timestamp(3)`.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitDecision> {
  const rows = await prisma.$queryRaw<ConsumeRow[]>`
    INSERT INTO "ActionRateLimit" ("key", "count", "windowStart", "expiresAt")
    VALUES (
      ${key},
      1,
      (now() AT TIME ZONE 'UTC'),
      (now() AT TIME ZONE 'UTC') + (${rule.windowSeconds}::int * interval '1 second')
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ActionRateLimit"."expiresAt" <= (now() AT TIME ZONE 'UTC')
        THEN 1 ELSE "ActionRateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "ActionRateLimit"."expiresAt" <= (now() AT TIME ZONE 'UTC')
        THEN (now() AT TIME ZONE 'UTC') ELSE "ActionRateLimit"."windowStart" END,
      "expiresAt" = CASE WHEN "ActionRateLimit"."expiresAt" <= (now() AT TIME ZONE 'UTC')
        THEN (now() AT TIME ZONE 'UTC') + (${rule.windowSeconds}::int * interval '1 second')
        ELSE "ActionRateLimit"."expiresAt" END
    RETURNING
      "count",
      CEIL(EXTRACT(EPOCH FROM ("expiresAt" - (now() AT TIME ZONE 'UTC'))))::int AS "retryAfter"
  `;
  const row = rows[0];
  if (!row) throw new Error('ActionRateLimit upsert returned no rows');

  if (Math.random() < CLEANUP_PROBABILITY) cleanupExpired();

  return {
    allowed: row.count <= rule.max,
    count: row.count,
    retryAfterSeconds: Math.max(1, row.retryAfter),
  };
}

/**
 * Проверяет все лимиты набора и бросает RateLimitError с наибольшим временем ожидания.
 * Сбой БД не блокирует вход (fail-open): ошибка логируется, попытка пропускается.
 */
export async function enforceRateLimitChecks(checks: RateLimitCheck[]): Promise<void> {
  let retryAfter = 0;
  let denied: RateLimitCheck | null = null;

  for (const check of checks) {
    let decision: RateLimitDecision;
    try {
      decision = await consumeRateLimit(check.key, check.rule);
    } catch (error) {
      log.error(
        { err: error, action: check.action, scope: check.scope },
        '[rateLimit.consume] failed, allowing request',
      );
      continue;
    }
    log.debug(
      { action: check.action, scope: check.scope, count: decision.count, max: check.rule.max },
      '[rateLimit.consume]',
    );
    if (!decision.allowed && decision.retryAfterSeconds > retryAfter) {
      retryAfter = decision.retryAfterSeconds;
      denied = check;
    }
  }

  if (denied) {
    log.warn(
      { action: denied.action, scope: denied.scope, retryAfterSeconds: retryAfter },
      '[rateLimit.exceeded]',
    );
    throw new RateLimitError(retryAfter, { details: { action: denied.action } });
  }
}

/** Лимиты действия для субъекта (IP, email, пользователь) — см. RATE_LIMITS. */
export async function enforceRateLimit(
  action: RateLimitAction,
  subject: RateLimitSubject,
): Promise<void> {
  if (subject.ip === null && !unknownIpWarned) {
    unknownIpWarned = true;
    log.warn(
      { action },
      '[rateLimit.ip] client IP unknown, using a shared bucket (check X-Forwarded-For from the proxy)',
    );
  }
  await enforceRateLimitChecks(buildRateLimitChecks(action, subject));
}
