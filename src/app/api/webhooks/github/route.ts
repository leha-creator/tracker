import type { NextRequest } from 'next/server';

import {
  handleGithubWebhook,
  isGithubEnabled,
  verifyGithubWebhookSignature,
} from '@/modules/integrations/github';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.github.webhook');

/** Наибольший принимаемый вебхук (GitHub ограничивает 25 МБ; push с большими диффами нам не нужен). */
const MAX_BODY_BYTES = 10 * 1024 * 1024;
/** `X-GitHub-Delivery` — GUID. */
const DELIVERY_ID_RE = /^[0-9a-f-]{8,64}$/i;
const EVENT_RE = /^[a-z_]{1,64}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Вебхуки GitHub App. Порядок: интеграция включена → размер → подпись по сырому телу →
 * заголовки → JSON → обработка. proxy `/api` не трогает; сессии здесь нет — доверие только подписи.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!(await isGithubEnabled())) return new Response('Not Found', { status: 404 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'payload too large' });
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return json(413, { error: 'payload too large' });
  }

  const event = request.headers.get('x-github-event') ?? '';
  const deliveryId = request.headers.get('x-github-delivery') ?? '';
  if (!verifyGithubWebhookSignature(body, request.headers.get('x-hub-signature-256'))) {
    log.warn({ event, deliveryId }, '[github.webhook] invalid signature');
    return json(401, { error: 'invalid signature' });
  }
  if (!EVENT_RE.test(event) || !DELIVERY_ID_RE.test(deliveryId)) {
    log.warn({ event, deliveryId }, '[github.webhook] invalid headers');
    return json(400, { error: 'invalid headers' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    log.warn({ event, deliveryId }, '[github.webhook] invalid JSON');
    return json(400, { error: 'invalid JSON' });
  }

  try {
    const result = await handleGithubWebhook({ event, deliveryId, payload });
    return json(200, { result });
  } catch (error) {
    return toErrorResponse(error, { route: 'POST /api/webhooks/github', event, deliveryId });
  }
}
