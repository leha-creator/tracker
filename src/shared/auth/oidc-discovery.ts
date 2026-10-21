import 'server-only';

import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import { oidcSettingsFromEnv } from './oidc-config';

const log = createLogger('auth:oidc');

/** Таймаут запроса discovery: недоступный IdP не должен держать запросы tasker. */
const DISCOVERY_TIMEOUT_MS = 5_000;
/** Через сколько повторить discovery после неудачи. */
export const DISCOVERY_RETRY_MS = 30_000;

/** Поля discovery, без которых провайдер не работает (вход, проверка ID-токена, выход). */
const REQUIRED_FIELDS = [
  'issuer',
  'authorization_endpoint',
  'token_endpoint',
  'jwks_uri',
  'end_session_endpoint',
] as const;

export type OidcDiscoveryState =
  { status: 'unknown' } | { status: 'ready' } | { status: 'failed'; failedAt: number };

/**
 * Что делать с discovery при очередном запросе: `wait` — первая загрузка (запрос ждёт),
 * `background` — повтор после неудачи (запрос не ждёт), `none` — ничего.
 */
export function nextDiscoveryAction(
  state: OidcDiscoveryState,
  now: number,
): 'wait' | 'background' | 'none' {
  if (state.status === 'unknown') return 'wait';
  if (state.status === 'failed' && now - state.failedAt >= DISCOVERY_RETRY_MS) return 'background';
  return 'none';
}

/** Ошибка документа discovery (имя поля) или null, если документ пригоден. */
export function validateDiscovery(document: unknown, issuer: string): string | null {
  if (typeof document !== 'object' || document === null) return 'not an object';
  const record = document as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (typeof record[field] !== 'string' || record[field] === '') return `missing ${field}`;
  }
  // Issuer из discovery должен совпасть с настроенным: иначе ID-токены не пройдут проверку.
  if (record.issuer !== issuer) return 'issuer mismatch';
  return null;
}

const globalForOidc = globalThis as unknown as {
  oidcDiscovery?: OidcDiscoveryState;
  oidcDiscoveryLoading?: Promise<void>;
};

async function fetchDiscovery(issuer: string): Promise<void> {
  const url = `${issuer}/.well-known/openid-configuration`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const problem = validateDiscovery(await response.json(), issuer);
    if (problem) throw new Error(problem);
    globalForOidc.oidcDiscovery = { status: 'ready' };
    log.info({ issuer }, '[oidc.discovery] ready');
  } catch (error) {
    globalForOidc.oidcDiscovery = { status: 'failed', failedAt: Date.now() };
    log.warn(
      {
        issuer,
        reason: error instanceof Error ? error.message : String(error),
        retryInMs: DISCOVERY_RETRY_MS,
      },
      '[oidc.discovery] unavailable, sign-in through IdP is disabled until retry',
    );
  }
}

/**
 * Проверяет доступность IdP (discovery) перед getAuth(): провайдер genericOAuth читает discovery
 * один раз при создании экземпляра и молча пропускается, если IdP недоступен. Первая проверка
 * ждёт ответа (до 5 с), повтор после неудачи идёт в фоне раз в 30 с. После успеха — не повторяется.
 */
export async function loadOidcDiscovery(): Promise<void> {
  const settings = oidcSettingsFromEnv(getEnv());

  const state = globalForOidc.oidcDiscovery ?? { status: 'unknown' };
  // Проверка уже идёт: первую загрузку ждём, фоновый повтор — нет.
  if (globalForOidc.oidcDiscoveryLoading) {
    if (state.status === 'unknown') await globalForOidc.oidcDiscoveryLoading;
    return;
  }
  const action = nextDiscoveryAction(state, Date.now());
  if (action === 'none') return;

  log.debug({ action }, '[oidc.discovery] fetch');
  const loading = fetchDiscovery(settings.issuer).finally(() => {
    globalForOidc.oidcDiscoveryLoading = undefined;
  });
  globalForOidc.oidcDiscoveryLoading = loading;
  if (action === 'wait') await loading;
}

/** Последний результат проверки discovery без сетевого запроса: true — провайдер можно подключать. */
export function isOidcDiscoveryReady(): boolean {
  return globalForOidc.oidcDiscovery?.status === 'ready';
}
