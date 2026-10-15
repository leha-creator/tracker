import 'server-only';

import { z } from 'zod';

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

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
  })
  .transform((env) => ({
    ...env,
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
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
