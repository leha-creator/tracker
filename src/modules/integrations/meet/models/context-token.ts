import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

// Контекст задачи для meet (docs/meet.md): `<payload>.<signature>`, обе части — base64url;
// подпись — HMAC-SHA256(secret, "ctx." + payload). Подписывает tasker, проверяют meet при
// создании встречи и tasker при вебхуке meeting.created.

/** Срок ссылки «Начать созвон». */
export const CONTEXT_TTL_SECONDS = 600;
/** Насколько старый контекст tasker принимает в meeting.created (встречу создают сразу после клика). */
export const CONTEXT_WEBHOOK_MAX_AGE_SECONDS = 24 * 60 * 60;
/** Допуск на расхождение часов при проверке срока. */
const CLOCK_SKEW_SECONDS = 60;
const SIGNATURE_PREFIX = 'ctx.';

export const taskContextSchema = z.object({
  v: z.literal(1),
  iss: z.literal('tasker'),
  aud: z.literal('meet'),
  jti: z.uuid(),
  sub: z.string().min(1).max(255),
  workspaceId: z.string().min(1).max(64),
  workspaceName: z.string().max(100),
  taskId: z.uuid(),
  taskKey: z.string().min(1).max(32),
  taskTitle: z.string().max(300),
  taskUrl: z.url({ protocol: /^https?$/ }),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export type TaskContext = z.infer<typeof taskContextSchema>;

export type TaskContextError = 'malformed' | 'bad_signature' | 'expired' | 'too_old';

export type VerifyTaskContextResult =
  { ok: true; context: TaskContext } | { ok: false; error: TaskContextError };

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(SIGNATURE_PREFIX + payload, 'utf8')
    .digest();
}

/** Подписывает контекст. Строки обрезаются до лимитов схемы, чтобы meet не отклонил токен. */
export function signTaskContext(context: TaskContext, secret: string): string {
  const normalized: TaskContext = {
    ...context,
    workspaceName: context.workspaceName.slice(0, 100),
    taskTitle: context.taskTitle.slice(0, 300),
  };
  const payload = Buffer.from(JSON.stringify(normalized), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

/**
 * Проверяет подпись и поля контекста. `now` — Unix-секунды. Режим `link` — проверка `exp` (ссылка
 * действует 10 минут); режим `webhook` — `exp` не важен, но `iat` не старше суток.
 */
export function verifyTaskContext(
  token: string,
  secret: string,
  options: { now: number; mode: 'link' | 'webhook' },
): VerifyTaskContextResult {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'malformed' };
  const [payload, signature] = parts as [string, string];

  const received = Buffer.from(signature, 'base64url');
  const expected = sign(payload, secret);
  // Другая длина — сразу отказ: timingSafeEqual бросил бы.
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, error: 'bad_signature' };
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'malformed' };
  }
  const parsed = taskContextSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'malformed' };
  const context = parsed.data;

  if (options.mode === 'link') {
    if (context.exp + CLOCK_SKEW_SECONDS < options.now) return { ok: false, error: 'expired' };
  } else if (context.iat + CONTEXT_WEBHOOK_MAX_AGE_SECONDS < options.now) {
    return { ok: false, error: 'too_old' };
  }
  return { ok: true, context };
}
