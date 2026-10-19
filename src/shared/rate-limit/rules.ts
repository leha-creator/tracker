/** Правило лимита: не больше `max` попыток за окно `windowSeconds` (фиксированное окно). */
export interface RateLimitRule {
  windowSeconds: number;
  max: number;
}

/**
 * По чему считается лимит:
 * - `ip` — все попытки с одного адреса;
 * - `ipEmail` — пара «адрес + email»: перебор паролей одного аккаунта. Только по email без IP
 *   не считаем — иначе злоумышленник заблокировал бы вход жертве;
 * - `user` — действия вошедшего пользователя.
 */
export type RateLimitScope = 'ip' | 'ipEmail' | 'user';

type RateLimitRules = Partial<Record<RateLimitScope, RateLimitRule>>;

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** Лимиты Server Actions аутентификации и тяжёлых выгрузок (см. docs/architecture.md, «Безопасность аутентификации»). */
export const RATE_LIMITS = {
  'sign-in': {
    ip: { windowSeconds: 10 * MINUTE, max: 30 },
    ipEmail: { windowSeconds: 10 * MINUTE, max: 5 },
  },
  'sign-up': { ip: { windowSeconds: HOUR, max: 5 } },
  'password-reset-request': {
    ip: { windowSeconds: HOUR, max: 10 },
    ipEmail: { windowSeconds: HOUR, max: 3 },
  },
  'password-reset': { ip: { windowSeconds: 10 * MINUTE, max: 10 } },
  'verification-resend': {
    ip: { windowSeconds: HOUR, max: 10 },
    ipEmail: { windowSeconds: HOUR, max: 3 },
  },
  // До входа userId неизвестен; перебор кодов одного пользователя дополнительно ограничивает
  // встроенная блокировка плагина twoFactor (failedVerificationCount / lockedUntil).
  'two-factor-verify': { ip: { windowSeconds: 10 * MINUTE, max: 20 } },
  // Действия с подтверждением паролем в профиле: смена пароля, включение и выключение 2FA,
  // перевыпуск резервных кодов — перебор пароля вошедшего пользователя.
  'change-password': { user: { windowSeconds: 10 * MINUTE, max: 5 } },
  // Письма пользователям из админки (сброс пароля, подтверждение email, тестовое письмо):
  // защита почтового ящика пользователя и репутации SMTP.
  'admin-mail': { user: { windowSeconds: HOUR, max: 10 } },
  // Вход администратора от имени пользователя: каждая попытка создаёт сессию.
  'admin-impersonate': { user: { windowSeconds: HOUR, max: 30 } },
  // Выгрузка CSV читает до 10 000 задач за запрос — тяжёлая операция для БД.
  'tasks.export': { user: { windowSeconds: MINUTE, max: 10 } },
} as const satisfies Record<string, RateLimitRules>;

export type RateLimitAction = keyof typeof RATE_LIMITS;
