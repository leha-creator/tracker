import 'server-only';

import { isUniqueViolation, prisma } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import { handleCreate, handleDelete, handlePush } from './handlers/branch';
import { handleInstallation, handleInstallationRepositories } from './handlers/installation';
import {
  handleCheckSuite,
  handlePullRequest,
  handlePullRequestReview,
} from './handlers/pull-request';
import { webhookRepository } from './webhook.repository';
import type { WebhookContext, WebhookHandler } from './webhook.types';

const log = createLogger('github.webhook');

/** Доставки хранятся неделю: GitHub позволяет повторить доставку вручную в течение нескольких дней. */
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Примерно каждая сотая доставка заодно чистит старые записи. */
const PURGE_PROBABILITY = 0.01;
/** Обработчики не ходят в GitHub API внутри транзакции, но событие может затронуть много задач. */
const TRANSACTION_TIMEOUT_MS = 15_000;

/** Обработчики по `X-GitHub-Event`. Остальные события — 200 `ignored`. */
const HANDLERS: Partial<Record<string, WebhookHandler>> = {
  installation: handleInstallation,
  installation_repositories: handleInstallationRepositories,
  pull_request: handlePullRequest,
  pull_request_review: handlePullRequestReview,
  check_suite: handleCheckSuite,
  push: handlePush,
  create: handleCreate,
  delete: handleDelete,
};

export type WebhookResult = 'handled' | 'ignored' | 'duplicate';

/**
 * Обработка проверенного (подпись) вебхука: идемпотентность по deliveryId → обработчик в
 * транзакции → действия после коммита. Ошибка обработчика — доставка забывается и пробрасывается
 * (ответ 500, GitHub позволит повторить доставку).
 */
export async function handleGithubWebhook(input: {
  event: string;
  deliveryId: string;
  payload: unknown;
}): Promise<WebhookResult> {
  const { event, deliveryId, payload } = input;
  const action =
    typeof payload === 'object' && payload !== null && 'action' in payload
      ? String(payload.action)
      : null;
  const startedAt = Date.now();
  log.debug({ event, action, deliveryId }, '[github.webhook] received');

  const handler = HANDLERS[event];
  if (!handler) {
    log.debug({ event, action, deliveryId }, '[github.webhook] ignored: no handler');
    return 'ignored';
  }

  try {
    await webhookRepository.recordDelivery(deliveryId, event);
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.warn({ event, action, deliveryId }, '[github.webhook] duplicate delivery');
      return 'duplicate';
    }
    throw error;
  }

  const afterCommit: { label: string; task: () => Promise<void> | void }[] = [];
  let outcome: WebhookResult;
  try {
    outcome = await prisma.$transaction(
      (tx) => {
        const ctx: WebhookContext = {
          tx,
          deliveryId,
          afterCommit: (label, task) => afterCommit.push({ label, task }),
        };
        return handler(payload, ctx);
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    log.error({ err: error, event, action, deliveryId }, '[github.webhook] handler failed');
    await webhookRepository.forgetDelivery(deliveryId).catch((forgetError: unknown) => {
      log.error({ err: forgetError, deliveryId }, '[github.webhook] forget delivery failed');
    });
    throw error;
  }

  for (const { label, task } of afterCommit) {
    try {
      await task();
    } catch (error) {
      log.error(
        { err: error, event, deliveryId, label },
        '[github.webhook] after-commit task failed',
      );
    }
  }

  if (Math.random() < PURGE_PROBABILITY) {
    const purged = await webhookRepository
      .purgeDeliveriesBefore(new Date(Date.now() - DELIVERY_RETENTION_MS))
      .catch((error: unknown) => {
        log.warn({ err: error }, '[github.webhook] purge failed');
        return 0;
      });
    log.debug({ purged }, '[github.webhook] old deliveries purged');
  }

  const level = outcome === 'handled' ? 'info' : 'debug';
  log[level](
    { event, action, deliveryId, outcome, durationMs: Date.now() - startedAt },
    '[github.webhook] handled',
  );
  return outcome;
}
