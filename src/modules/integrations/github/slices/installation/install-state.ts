import 'server-only';

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Срок жизни state установки: столько есть на установку приложения на GitHub. */
export const INSTALL_STATE_TTL_MS = 10 * 60 * 1000;

/** Контекст HKDF: ключ подписи state не совпадает с ключами Better Auth от того же секрета. */
const HKDF_INFO = 'tasker:github-install-state';

interface InstallStatePayload {
  /** workspaceId */
  w: string;
  /** slug пространства — для редиректа после установки. */
  s: string;
  /** userId владельца, начавшего установку. */
  u: string;
  /** Срок действия, мс с эпохи. */
  e: number;
  /** Случайность: два state одного пользователя различаются. */
  n: string;
}

function signingKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), HKDF_INFO, 32));
}

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', signingKey(secret)).update(body).digest();
}

/**
 * Подписанный `state` для ссылки установки GitHub App: GitHub вернёт его на Setup URL.
 * Связывает установку с пространством и пользователем, начавшим её (защита от CSRF и подмены).
 */
export function signInstallState(
  input: { workspaceId: string; workspaceSlug: string; userId: string },
  secret: string,
  now: number = Date.now(),
): string {
  const payload: InstallStatePayload = {
    w: input.workspaceId,
    s: input.workspaceSlug,
    u: input.userId,
    e: now + INSTALL_STATE_TTL_MS,
    n: randomBytes(8).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret).toString('base64url')}`;
}

/**
 * Slug пространства из state без проверки подписи — только чтобы вернуть пользователя на
 * страницу настроек с ошибкой (страница сама проверяет доступ). Не для решений о доступе.
 */
export function peekInstallStateSlug(raw: string): string | null {
  const [body] = raw.split('.');
  if (!body) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { s?: unknown };
    return typeof payload.s === 'string' && /^[a-z0-9-]{1,64}$/.test(payload.s) ? payload.s : null;
  } catch {
    return null;
  }
}

/**
 * Проверяет state: подпись, срок и что его создал этот же пользователь. Иначе — null
 * (причину не различаем: вызывающий отвечает одной ошибкой).
 */
export function verifyInstallState(
  raw: string,
  userId: string,
  secret: string,
  now: number = Date.now(),
): { workspaceId: string; workspaceSlug: string } | null {
  const [body, signature, extra] = raw.split('.');
  if (!body || !signature || extra !== undefined) return null;

  const expected = sign(body, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let payload: Partial<InstallStatePayload>;
  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<InstallStatePayload>;
  } catch {
    return null;
  }
  if (
    typeof payload.w !== 'string' ||
    typeof payload.s !== 'string' ||
    typeof payload.u !== 'string' ||
    typeof payload.e !== 'number'
  ) {
    return null;
  }
  if (payload.u !== userId || payload.e < now) return null;
  return { workspaceId: payload.w, workspaceSlug: payload.s };
}
