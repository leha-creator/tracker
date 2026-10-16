import { createHash } from 'node:crypto';

import {
  RATE_LIMITS,
  type RateLimitAction,
  type RateLimitRule,
  type RateLimitScope,
} from './rules';

/** Для общего бакета запросов без определённого IP. */
export const UNKNOWN_IP = 'unknown';

/** Кто делает попытку. `ip: null` — адрес не определён (общий бакет). */
export interface RateLimitSubject {
  ip: string | null;
  email?: string;
  userId?: string;
}

export interface RateLimitCheck {
  action: RateLimitAction;
  scope: RateLimitScope;
  key: string;
  rule: RateLimitRule;
}

/**
 * Короткий хеш идентификатора (email) для ключа: email в открытом виде в БД не хранится.
 * Регистр и пробелы по краям не влияют.
 */
export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function rateLimitKey(
  action: RateLimitAction,
  scope: RateLimitScope,
  ...parts: string[]
): string {
  return [action, scope, ...parts].join(':');
}

/**
 * Проверки для действия по его правилам. Правило пропускается, если для него нет данных
 * (например, `ipEmail` без email или `user` без userId).
 */
export function buildRateLimitChecks(
  action: RateLimitAction,
  subject: RateLimitSubject,
): RateLimitCheck[] {
  const rules: Partial<Record<RateLimitScope, RateLimitRule>> = RATE_LIMITS[action];
  const ip = subject.ip ?? UNKNOWN_IP;
  const checks: RateLimitCheck[] = [];

  if (rules.ip) {
    checks.push({ action, scope: 'ip', key: rateLimitKey(action, 'ip', ip), rule: rules.ip });
  }
  if (rules.ipEmail && subject.email) {
    checks.push({
      action,
      scope: 'ipEmail',
      key: rateLimitKey(action, 'ipEmail', ip, hashIdentifier(subject.email)),
      rule: rules.ipEmail,
    });
  }
  if (rules.user && subject.userId) {
    checks.push({
      action,
      scope: 'user',
      key: rateLimitKey(action, 'user', subject.userId),
      rule: rules.user,
    });
  }
  return checks;
}
