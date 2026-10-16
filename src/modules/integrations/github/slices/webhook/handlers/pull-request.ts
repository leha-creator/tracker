import 'server-only';

import { createLogger } from '@/shared/logger';

import {
  aggregateChecksState,
  aggregateReviewState,
  mergeReviewerState,
  pullRequestTransition,
  toReviewerState,
} from '../../../models';
import { resolveReferencedTasks, syncPullRequestLinks } from '../../link/link.service';
import {
  schedulePullRequestEffects,
  scheduleReviewEffects,
  scheduleWorkspaceRevalidation,
} from '../../pull-request/pull-request.effects';
import { pullRequestRepository } from '../../pull-request/pull-request.repository';
import {
  loadRepositoryWorkspaces,
  storePullRequest,
} from '../../pull-request/pull-request.service';
import {
  checkSuiteEventSchema,
  pullRequestEventSchema,
  pullRequestReviewEventSchema,
  type SenderPayload,
} from '../webhook.schema';
import type { WebhookHandler } from '../webhook.types';

const log = createLogger('github.webhook.pr');

/** Действия pull_request, которые меняют PR или его ссылки на задачи. */
const PULL_REQUEST_ACTIONS: ReadonlySet<string> = new Set([
  'opened',
  'edited',
  'reopened',
  'closed',
  'synchronize',
  'ready_for_review',
  'converted_to_draft',
]);

function toSender(sender: SenderPayload): { id: bigint; login: string } | null {
  return sender ? { id: BigInt(sender.id), login: sender.login } : null;
}

/**
 * `pull_request`: сохранить PR → пересчитать автосвязи по ссылкам в ветке, заголовке и описании
 * → автоматизация и уведомления после коммита.
 */
export const handlePullRequest: WebhookHandler = async (payload, ctx) => {
  const event = pullRequestEventSchema.parse(payload);
  if (!PULL_REQUEST_ACTIONS.has(event.action)) return 'ignored';
  const { tx } = ctx;
  const workspaces = await loadRepositoryWorkspaces(tx, event);
  if (workspaces.length === 0) return 'ignored';

  const repositoryId = BigInt(event.repository.id);
  const pr = event.pull_request;
  const stored = await storePullRequest(tx, repositoryId, pr);
  if (!stored) return 'ignored';

  const referenced = await resolveReferencedTasks(workspaces, pr.head.ref, pr.title, pr.body);
  const links = await syncPullRequestLinks(tx, {
    pullRequestId: stored.id,
    workspaces,
    referenced,
  });

  schedulePullRequestEffects(
    {
      pullRequest: {
        id: stored.id,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: stored.state,
        repositoryFullName: event.repository.full_name,
        authorId: pr.user ? BigInt(pr.user.id) : null,
        authorLogin: pr.user?.login ?? null,
      },
      transition: pullRequestTransition(stored.previousState, stored.state),
      added: links.added,
      active: links.active,
      sender: toSender(event.sender),
    },
    ctx,
  );
  return 'handled';
};

/** `pull_request_review`: последнее ревью ревьюера → итог ревью PR. */
export const handlePullRequestReview: WebhookHandler = async (payload, ctx) => {
  const event = pullRequestReviewEventSchema.parse(payload);
  if (!['submitted', 'edited', 'dismissed'].includes(event.action)) return 'ignored';
  const { tx } = ctx;
  const workspaces = await loadRepositoryWorkspaces(tx, event);
  if (workspaces.length === 0) return 'ignored';

  const repositoryId = BigInt(event.repository.id);
  const pr = event.pull_request;
  // PR мог прийти раньше, чем мы начали слушать события, — сохраняем из ревью (без связей).
  await storePullRequest(tx, repositoryId, pr);
  const pullRequestId = BigInt(pr.id);

  const reviewer = event.review.user;
  const incoming = event.action === 'dismissed' ? 'dismissed' : toReviewerState(event.review.state);
  if (!reviewer || !incoming) {
    log.debug(
      { pullRequestId: pullRequestId.toString(), state: event.review.state },
      '[github.pr] review skipped',
    );
    return 'ignored';
  }
  const reviewerId = BigInt(reviewer.id);
  const current = await pullRequestRepository.findReview(tx, pullRequestId, reviewerId);
  const state = mergeReviewerState(current ? toReviewerState(current.state) : null, incoming);
  await pullRequestRepository.upsertReview(tx, {
    pullRequestId,
    reviewerId,
    state,
    submittedAt: event.review.submitted_at ? new Date(event.review.submitted_at) : new Date(),
  });
  const reviewState = aggregateReviewState(
    await pullRequestRepository.listReviews(tx, pullRequestId),
  );
  await pullRequestRepository.setReviewState(tx, pullRequestId, reviewState);
  log.info(
    {
      pullRequestId: pullRequestId.toString(),
      reviewer: reviewerId.toString(),
      state,
      reviewState,
    },
    '[github.pr] review stored',
  );

  scheduleWorkspaceRevalidation(ctx);
  // Уведомляем о самом ревью, а не об итоге: комментарий после одобрения не повторяет «одобрено».
  if (
    event.action === 'submitted' &&
    (incoming === 'approved' || incoming === 'changes_requested')
  ) {
    scheduleReviewEffects(
      {
        pullRequestId,
        workspaces,
        reviewState: incoming,
        pullRequest: {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          repositoryFullName: event.repository.full_name,
          authorId: pr.user ? BigInt(pr.user.id) : null,
        },
        sender: toSender(event.sender),
      },
      ctx,
    );
  }
  return 'handled';
};

/** `check_suite`: статус CI коммита → итог CI у PR с этим последним коммитом. */
export const handleCheckSuite: WebhookHandler = async (payload, ctx) => {
  const event = checkSuiteEventSchema.parse(payload);
  if (!['requested', 'rerequested', 'completed'].includes(event.action)) return 'ignored';
  const { tx } = ctx;
  const workspaces = await loadRepositoryWorkspaces(tx, event);
  if (workspaces.length === 0) return 'ignored';

  const repositoryId = BigInt(event.repository.id);
  const suite = event.check_suite;
  await pullRequestRepository.upsertCheckSuite(tx, {
    id: BigInt(suite.id),
    repositoryId,
    headSha: suite.head_sha,
    status: suite.status ?? (event.action === 'completed' ? 'completed' : 'queued'),
    conclusion: suite.conclusion,
  });
  const checksState = aggregateChecksState(
    await pullRequestRepository.listCheckSuites(tx, repositoryId, suite.head_sha),
  );
  const updated = await pullRequestRepository.setChecksStateBySha(
    tx,
    repositoryId,
    suite.head_sha,
    checksState,
  );
  log.debug(
    {
      repositoryId: repositoryId.toString(),
      suiteId: suite.id,
      checksState,
      pullRequests: updated.length,
    },
    '[github.pr] checks updated',
  );
  if (updated.length > 0) scheduleWorkspaceRevalidation(ctx);
  return 'handled';
};
