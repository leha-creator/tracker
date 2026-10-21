import 'server-only';

import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import { IdpApiError, idpBasicAuthorization, parseIdpError } from './idp-protocol';

const log = createLogger('idp');

const IDP_TIMEOUT_MS = 5_000;

interface IdpRequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | null | undefined>;
  body?: Record<string, unknown>;
}

/**
 * Запрос к API IdP от имени клиента tasker (Basic с секретом клиента). Ответ — JSON как есть,
 * ошибка ответа или связи — IdpApiError. Секрет и тела запросов не логируются.
 */
export async function idpRequest(path: string, options: IdpRequestOptions = {}): Promise<unknown> {
  const env = getEnv();
  const url = new URL(path, env.OIDC_ISSUER);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  const method = options.method ?? 'GET';
  const route = `${method} ${url.pathname}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: idpBasicAuthorization(env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET),
        accept: 'application/json',
        ...(options.body && { 'content-type': 'application/json' }),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(IDP_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    log.error(
      { route, reason: error instanceof Error ? error.message : String(error) },
      '[idp.request] unavailable',
    );
    throw new IdpApiError({
      status: 0,
      code: 'UNAVAILABLE',
      message: 'plwedding ID не отвечает',
      cause: error,
    });
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = parseIdpError(response.status, body, response.headers.get('retry-after'));
    const level = response.status >= 500 || response.status === 401 ? 'error' : 'warn';
    log[level]({ route, status: response.status, code: error.code }, '[idp.request] rejected');
    throw error;
  }
  log.debug({ route, status: response.status }, '[idp.request] ok');
  return body;
}
