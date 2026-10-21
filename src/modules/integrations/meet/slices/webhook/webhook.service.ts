import 'server-only';

import type { z } from 'zod';

import { isUniqueViolation, prisma } from '@/shared/db';
import { ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { getMeetConfig } from '../../meet-config';
import {
  meetingCreatedSchema,
  meetingEndedSchema,
  recapReadySchema,
  verifyWebhookSignature,
  type MeetWebhookEvent,
} from '../../models';
import { meetingRepository } from '../meeting/meeting.repository';
import { handleMeetingCreated, handleMeetingEnded, handleRecapReady } from './webhook.handlers';
import type { MeetWebhookContext, MeetWebhookOutcome } from './webhook.types';

const log = createLogger('integrations:meet');

/** Доставки хранятся неделю: meet повторяет доставку не дольше суток. */
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Примерно каждая сотая доставка заодно чистит старые записи. */
const PURGE_PROBABILITY = 0.01;
const TRANSACTION_TIMEOUT_MS = 15_000;

interface HandlerEntry<S extends z.ZodType> {
  schema: S;
  handle: (event: z.infer<S>, ctx: MeetWebhookContext) => Promise<MeetWebhookOutcome>;
}

function entry<S extends z.ZodType>(
  schema: S,
  handle: HandlerEntry<S>['handle'],
): HandlerEntry<z.ZodType> {
  return { schema, handle: handle as HandlerEntry<z.ZodType>['handle'] };
}

const HANDLERS: Record<MeetWebhookEvent, HandlerEntry<z.ZodType>> = {
  'meeting.created': entry(meetingCreatedSchema, handleMeetingCreated),
  'meeting.ended': entry(meetingEndedSchema, handleMeetingEnded),
  'recap.ready': entry(recapReadySchema, handleRecapReady),
};

export type MeetWebhookResult = MeetWebhookOutcome | 'duplicate';

/** Подпись вебхука на MEET_WEBHOOK_SECRET; без настройки — всегда false. */
export function verifyMeetWebhookSignature(body: string, header: string | null): boolean {
  const config = getMeetConfig();
  if (!config) return false;
  const result = verifyWebhookSignature(
    body,
    header,
    config.webhookSecret,
    Math.floor(Date.now() / 1000),
  );
  if (!result.ok) log.warn({ reason: result.error }, '[meet.webhook] signature rejected');
  return result.ok;
}

/**
 * Обработка проверенного (подпись) вебхука meet: схема события (ошибка — 400, без повтора) →
 * идемпотентность по deliveryId → обработчик в транзакции → действия после коммита. Ошибка
 * обработчика — доставка забывается и пробрасывается (500, meet повторит).
 */
export async function handleMeetWebhook(input: {
  event: MeetWebhookEvent;
  deliveryId: string;
  payload: unknown;
}): Promise<MeetWebhookResult> {
  const { event, deliveryId } = input;
  const startedAt = Date.now();
  const handler = HANDLERS[event];

  const parsed = handler.schema.safeParse(input.payload);
  if (!parsed.success) {
    log.warn(
      { event, deliveryId, issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) },
      '[meet.webhook] invalid payload',
    );
    throw new ValidationError('Событие не соответствует контракту');
  }
  log.debug({ event, deliveryId }, '[meet.webhook] received');

  try {
    await meetingRepository.recordDelivery(deliveryId, event);
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.warn({ event, deliveryId }, '[meet.webhook] duplicate delivery');
      return 'duplicate';
    }
    throw error;
  }

  const afterCommit: { label: string; task: () => Promise<void> | void }[] = [];
  let outcome: MeetWebhookOutcome;
  try {
    outcome = await prisma.$transaction(
      (tx) =>
        handler.handle(parsed.data, {
          tx,
          deliveryId,
          afterCommit: (label, task) => afterCommit.push({ label, task }),
        }),
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    log.error({ err: error, event, deliveryId }, '[meet.webhook] handler failed');
    await meetingRepository.forgetDelivery(deliveryId).catch((forgetError: unknown) => {
      log.error({ err: forgetError, deliveryId }, '[meet.webhook] forget delivery failed');
    });
    throw error;
  }

  for (const { label, task } of afterCommit) {
    try {
      await task();
    } catch (error) {
      log.error(
        { err: error, event, deliveryId, label },
        '[meet.webhook] after-commit task failed',
      );
    }
  }

  if (Math.random() < PURGE_PROBABILITY) {
    const purged = await meetingRepository
      .purgeDeliveriesBefore(new Date(Date.now() - DELIVERY_RETENTION_MS))
      .catch((error: unknown) => {
        log.warn({ err: error }, '[meet.webhook] purge failed');
        return 0;
      });
    log.debug({ purged }, '[meet.webhook] old deliveries purged');
  }

  log.info(
    { event, deliveryId, outcome, durationMs: Date.now() - startedAt },
    '[meet.webhook] handled',
  );
  return outcome;
}
