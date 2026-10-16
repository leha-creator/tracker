import 'server-only';

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Столько есть у администратора, чтобы подтвердить создание приложения на GitHub. */
export const MANIFEST_STATE_TTL_MS = 60 * 60 * 1000;

/** Контекст HKDF: ключ не совпадает с ключами Better Auth и state установки. */
const HKDF_INFO = 'tasker:github-app-manifest-state';

/**
 * Права приложения: только чтение (docs/github.md). Право пользователя «Email addresses» манифест
 * не принимает (GitHub отвечает «Default permission … is not included in the list») — его
 * администратор включает в настройках приложения после создания.
 */
const PERMISSIONS = {
  metadata: 'read',
  contents: 'read',
  pull_requests: 'read',
  checks: 'read',
} as const;

const EVENTS = ['pull_request', 'pull_request_review', 'push', 'create', 'delete', 'check_suite'];

/**
 * Адрес, до которого GitHub не достучится (localhost, частная сеть): вебхук на такой адрес
 * GitHub не принимает, поэтому приложение создаётся без вебхука.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  const { hostname } = new URL(baseUrl);
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '[::1]' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === '0.0.0.0'
  );
}

/**
 * Манифест GitHub App для Tasker (https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).
 * `public` — приложение могут установить любые аккаунты и организации, а не только владелец.
 */
export function buildAppManifest(input: { baseUrl: string; name: string; isPublic: boolean }) {
  const base = input.baseUrl.replace(/\/+$/, '');
  const withWebhook = !isLocalBaseUrl(base);
  return {
    name: input.name,
    url: base,
    description: 'Привязка PR, веток и коммитов к задачам Tasker.',
    public: input.isPublic,
    redirect_url: `${base}/api/integrations/github/manifest`,
    callback_urls: [`${base}/api/auth/callback/github`],
    setup_url: `${base}/api/integrations/github/setup`,
    setup_on_update: true,
    request_oauth_on_install: false,
    default_permissions: PERMISSIONS,
    ...(withWebhook
      ? {
          hook_attributes: { url: `${base}/api/webhooks/github`, active: true },
          default_events: EVENTS,
        }
      : {}),
  };
}

/** Адрес формы GitHub, куда POST-ом отправляется манифест. */
export function manifestFormUrl(organization: string | null, state: string): string {
  const path = organization
    ? `/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : '/settings/apps/new';
  return `https://github.com${path}?state=${encodeURIComponent(state)}`;
}

interface ManifestStatePayload {
  /** userId администратора. */
  u: string;
  /** Срок действия, мс с эпохи. */
  e: number;
  n: string;
}

function sign(body: string, secret: string): Buffer {
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), HKDF_INFO, 32));
  return createHmac('sha256', key).update(body).digest();
}

/** Подписанный state манифеста: GitHub вернёт его на redirect_url вместе с code. */
export function signManifestState(userId: string, secret: string, now = Date.now()): string {
  const payload: ManifestStatePayload = {
    u: userId,
    e: now + MANIFEST_STATE_TTL_MS,
    n: randomBytes(8).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret).toString('base64url')}`;
}

/** Подпись, срок и что state создал этот же администратор. */
export function verifyManifestState(
  raw: string,
  userId: string,
  secret: string,
  now = Date.now(),
): boolean {
  const [body, signature, extra] = raw.split('.');
  if (!body || !signature || extra !== undefined) return false;
  const expected = sign(body, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<ManifestStatePayload>;
    return payload.u === userId && typeof payload.e === 'number' && payload.e >= now;
  } catch {
    return false;
  }
}
