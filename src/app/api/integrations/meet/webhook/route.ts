import type { NextRequest } from 'next/server';

import {
  handleMeetWebhook,
  isMeetEnabled,
  isMeetWebhookEvent,
  verifyMeetWebhookSignature,
} from '@/modules/integrations/meet';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.meet.webhook');

/** Конспект — JSON до нескольких десятков КБ; расшифровка в tasker не передаётся. */
const MAX_BODY_BYTES = 256 * 1024;
const DELIVERY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Вебхуки meet (docs/meet.md). Порядок: интеграция включена → размер → подпись по сырому телу →
 * заголовки → JSON → обработка. Сессии нет — доверие только подписи.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isMeetEnabled()) return new Response('Not Found', { status: 404 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'payload too large' });
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return json(413, { error: 'payload too large' });
  }

  const event = request.headers.get('x-meet-event') ?? '';
  const deliveryId = request.headers.get('x-meet-delivery') ?? '';
  if (!verifyMeetWebhookSignature(body, request.headers.get('x-meet-signature'))) {
    log.warn({ event, deliveryId }, '[meet.webhook] invalid signature');
    return json(401, { error: 'invalid signature' });
  }
  if (!isMeetWebhookEvent(event) || !DELIVERY_ID_RE.test(deliveryId)) {
    log.warn(
      { event: event.slice(0, 64), deliveryId: deliveryId.slice(0, 64) },
      '[meet.webhook] invalid headers',
    );
    return json(400, { error: 'invalid headers' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    log.warn({ event, deliveryId }, '[meet.webhook] invalid JSON');
    return json(400, { error: 'invalid JSON' });
  }

  try {
    const result = await handleMeetWebhook({ event, deliveryId, payload });
    return json(200, { result });
  } catch (error) {
    return toErrorResponse(error, {
      route: 'POST /api/integrations/meet/webhook',
      event,
      deliveryId,
    });
  }
}
