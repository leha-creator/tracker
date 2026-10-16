import 'server-only';

import { revalidatePath } from 'next/cache';

import type { PullRequestState, PullRequestTransition } from '../../models';
import { applyPullRequestAutomation } from '../automation/automation.service';
import { notifyPullRequestChange, notifyReview } from '../notify/github-notify';
import type { LinkedTask, LinkWorkspace } from '../link/link.service';
import type { WebhookContext } from '../webhook/webhook.types';

/** Что изменилось в PR — входные данные для автоматизации статусов и уведомлений. */
export interface PullRequestChange {
  pullRequest: {
    id: bigint;
    number: number;
    title: string;
    url: string;
    state: PullRequestState;
    repositoryFullName: string;
    authorId: bigint | null;
    authorLogin: string | null;
  };
  /** Переход, запускающий автоматизацию (для всех действующих связей); null — нет. */
  transition: PullRequestTransition | null;
  /** Новые связи с задачами в этом событии. */
  added: LinkedTask[];
  /** Все действующие связи PR. */
  active: LinkedTask[];
  /** Автор действия в GitHub (sender). */
  sender: { id: bigint; login: string } | null;
}

/** Страницы пространства с задачами показывают состояние PR — обновить после коммита. */
export function scheduleWorkspaceRevalidation(ctx: WebhookContext): void {
  ctx.afterCommit('revalidate', () => revalidatePath('/w/[workspaceSlug]', 'layout'));
}

/**
 * Действия после изменения PR: автосмена статуса и ревалидация (в том числе когда связи
 * только сняли).
 */
export function schedulePullRequestEffects(change: PullRequestChange, ctx: WebhookContext): void {
  // Порядок важен: сначала статусы, затем ревалидация показывает уже новые колонки.
  ctx.afterCommit('automation', async () => {
    await applyPullRequestAutomation({
      transition: change.transition,
      state: change.pullRequest.state,
      active: change.active,
      added: change.added,
    });
  });
  ctx.afterCommit('notify', () => notifyPullRequestChange(change));
  scheduleWorkspaceRevalidation(ctx);
}

/** Отправленное ревью «одобрено» или «нужны изменения» — для уведомления автору PR. */
export interface ReviewChange {
  pullRequestId: bigint;
  workspaces: readonly LinkWorkspace[];
  reviewState: 'approved' | 'changes_requested';
  pullRequest: {
    number: number;
    title: string;
    url: string;
    repositoryFullName: string;
    authorId: bigint | null;
  };
  sender: { id: bigint; login: string } | null;
}

/** Действия после ревью: уведомление автору PR. */
export function scheduleReviewEffects(change: ReviewChange, ctx: WebhookContext): void {
  ctx.afterCommit('notify', () => notifyReview(change));
}
