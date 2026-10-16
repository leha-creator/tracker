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
     * По умолчанию — S3_ENDPOINT (в Docker сервер ходит в minio:9000, а браузер — в localhost).
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
     * Обязательное подтверждение email: без него нельзя войти паролем и принять приглашение.
     * `false` — для локальных стендов без почты и e2e. В продакшене нужен настроенный SMTP.
     */
    AUTH_REQUIRE_EMAIL_VERIFICATION: z.stringbool().default(true),

    /**
     * SMTP для писем (приглашения, уведомления, подтверждение email, сброс пароля). Локально — Mailpit из compose.yml. По умолчанию 127.0.0.1,
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
  })
  .superRefine((env, ctx) => {
    const missing = GITHUB_KEYS.filter((key) => env[key] === undefined);
    // Все или ни одного: частичная настройка — ошибка, а не тихо выключенная интеграция.
    if (missing.length > 0 && missing.length < GITHUB_KEYS.length) {
      for (const key of missing) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Задайте все переменные GITHUB_*' });
      }
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
