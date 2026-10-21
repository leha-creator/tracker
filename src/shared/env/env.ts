import 'server-only';

import { z } from 'zod';

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const GITHUB_KEYS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_WEBHOOK_SECRET',
] as const;

const MEET_KEYS = ['MEET_URL', 'MEET_CONTEXT_SECRET', 'MEET_WEBHOOK_SECRET'] as const;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(3),
    S3_FORCE_PATH_STYLE: z.stringbool().default(true),
    /**
     * Адрес хранилища, видимый браузеру: на него подписываются ссылки загрузки и скачивания.
     * По умолчанию — S3_ENDPOINT (в Docker сервер ходит в minio:9000, а браузер — в localhost;
     * в проде оба адреса — https://storage.yandexcloud.net).
     */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    /** Квота файлового хранилища одного пространства (раздел «Документы»), МБ. */
    DOCUMENTS_WORKSPACE_QUOTA_MB: z.coerce.number().int().positive().max(1_048_576).default(1024),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    /** Email-адреса через запятую: такие пользователи при регистрации получают роль admin. */
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    /**
     * Вход — только через IdP plwedding ID (docs/configuration.md). Issuer — origin IdP без пути
     * (https://auth.plwedding.ru), discovery берётся с него.
     */
    OIDC_ISSUER: z.url({ protocol: /^https?$/ }),
    OIDC_CLIENT_ID: z.string().min(1).default('tasker'),
    /** Секрет клиента — тот же, что `OIDC_TASKER_CLIENT_SECRET` в env IdP. */
    OIDC_CLIENT_SECRET: z.string().min(32),

    /**
     * SMTP для писем (приглашения, уведомления, письма администратора). Локально — Mailpit из compose.yml. По умолчанию 127.0.0.1,
     * а не localhost: nodemailer резолвит имя сам, и на Windows/WSL lookup localhost может зависать.
     */
    SMTP_HOST: z.string().min(1).default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z.stringbool().default(false),
    // Пустая строка — «не задано»: compose передаёт `${SMTP_USER:-}` как "" для SMTP без авторизации.
    SMTP_USER: optionalNonEmpty,
    SMTP_PASSWORD: optionalNonEmpty,
    MAIL_FROM: z.string().min(3).default('Tasker <no-reply@tasker.local>'),

    /**
     * GitHub App (docs/github.md). Необязательно: либо все переменные заданы, либо все пусты —
     * тогда интеграция и вход через GitHub выключены. Ключ — PEM; в .env одной строкой с `\n`.
     */
    GITHUB_APP_ID: optionalNonEmpty,
    GITHUB_APP_SLUG: optionalNonEmpty,
    GITHUB_APP_PRIVATE_KEY: optionalNonEmpty,
    GITHUB_APP_CLIENT_ID: optionalNonEmpty,
    GITHUB_APP_CLIENT_SECRET: optionalNonEmpty,
    GITHUB_WEBHOOK_SECRET: optionalNonEmpty,

    /**
     * Связка с meet (docs/meet.md). Необязательно: все три заданы или ни одной — тогда созвонов по
     * задачам нет. MEET_URL — origin meet; секреты — общие с meet (TASKER_CONTEXT_SECRET и
     * TASKER_WEBHOOK_SECRET в его env).
     */
    MEET_URL: optionalNonEmpty.pipe(z.url({ protocol: /^https?$/ }).optional()),
    MEET_CONTEXT_SECRET: optionalNonEmpty.pipe(z.string().min(32).optional()),
    MEET_WEBHOOK_SECRET: optionalNonEmpty.pipe(z.string().min(32).optional()),

    /**
     * Секрет планировщика: `Authorization: Bearer …` у POST /api/cron/reminders и
     * /api/cron/cleanup. Не задан — эндпоинты отвечают 404: напоминания не рассылаются, журнал
     * действий не чистится.
     */
    CRON_SECRET: optionalNonEmpty.pipe(z.string().min(32).optional()),
    /** Часовой пояс напоминаний: какие сутки считаются «сегодня» и «завтра». */
    REMINDERS_TIMEZONE: z
      .string()
      .min(1)
      .default('Europe/Moscow')
      .refine(isValidTimeZone, 'Неизвестный часовой пояс IANA'),
    /** Срок хранения журнала действий, дней: старые события удаляет /api/cron/cleanup. */
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(180),
  })
  .superRefine((env, ctx) => {
    const missing = GITHUB_KEYS.filter((key) => env[key] === undefined);
    // Все или ни одного: частичная настройка — ошибка, а не тихо выключенная интеграция.
    if (missing.length > 0 && missing.length < GITHUB_KEYS.length) {
      for (const key of missing) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Задайте все переменные GITHUB_*' });
      }
    }
    const missingMeet = MEET_KEYS.filter((key) => env[key] === undefined);
    if (missingMeet.length > 0 && missingMeet.length < MEET_KEYS.length) {
      for (const key of missingMeet) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Задайте все переменные MEET_*' });
      }
    }
    if (env.MEET_URL !== undefined && new URL(env.MEET_URL).pathname !== '/') {
      ctx.addIssue({ code: 'custom', path: ['MEET_URL'], message: 'Origin meet без пути' });
    }
    if (new URL(env.OIDC_ISSUER).pathname !== '/') {
      ctx.addIssue({ code: 'custom', path: ['OIDC_ISSUER'], message: 'Origin IdP без пути' });
    }
    if (env.GITHUB_APP_ID !== undefined && !/^\d+$/.test(env.GITHUB_APP_ID)) {
      ctx.addIssue({ code: 'custom', path: ['GITHUB_APP_ID'], message: 'Числовой ID приложения' });
    }
    if (env.GITHUB_WEBHOOK_SECRET !== undefined && env.GITHUB_WEBHOOK_SECRET.length < 16) {
      ctx.addIssue({ code: 'custom', path: ['GITHUB_WEBHOOK_SECRET'], message: 'Не короче 16' });
    }
  })
  .transform((env) => ({
    ...env,
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
    S3_PUBLIC_ENDPOINT: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    // `\n` в одной строке .env → настоящие переводы строк PEM.
    GITHUB_APP_PRIVATE_KEY: env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    GITHUB_ENABLED: env.GITHUB_APP_ID !== undefined,
    MEET_ENABLED: env.MEET_URL !== undefined,
    MEET_URL: env.MEET_URL === undefined ? undefined : new URL(env.MEET_URL).origin,
    // new URL(...).origin — без завершающего `/`: issuer в discovery IdP записан так же.
    OIDC_ISSUER: new URL(env.OIDC_ISSUER).origin,
  }));

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';

  constructor(readonly invalidKeys: string[]) {
    // Только имена ключей: значения могут содержать секреты.
    super(`Невалидные переменные окружения: ${invalidKeys.join(', ')}`);
  }
}

/** Разбирает переменные окружения. Бросает EnvValidationError со списком невалидных ключей. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(root)'))];
    throw new EnvValidationError(keys);
  }
  return result.data;
}

let cached: Env | undefined;

/** Ленивый доступ к окружению: валидация при первом обращении, а не при импорте (не ломает `next build`). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Сбрасывает кеш окружения. Только для тестов. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, key: string | symbol) {
    return getEnv()[key as keyof Env];
  },
});
