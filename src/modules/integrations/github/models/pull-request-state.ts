/** Состояние PR в Tasker (enum GithubPrState в схеме). */
export const PULL_REQUEST_STATES = ['open', 'draft', 'merged', 'closed'] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

/** Состояние из полей pull_request вебхука или REST API. */
export function toPullRequestState(pr: {
  state: 'open' | 'closed';
  draft?: boolean | null;
  merged?: boolean | null;
  merged_at?: string | null;
}): PullRequestState {
  if (pr.state === 'open') return pr.draft ? 'draft' : 'open';
  return pr.merged || pr.merged_at ? 'merged' : 'closed';
}

/** Чем меньше, тем «важнее» для индикатора задачи с несколькими PR: открытый виднее слитого. */
const BADGE_PRIORITY: Record<PullRequestState, number> = {
  open: 0,
  draft: 1,
  merged: 2,
  closed: 3,
};

/** Состояние для индикатора на карточке: самое важное из PR задачи; null — PR нет. */
export function pickBadgeState(states: readonly PullRequestState[]): PullRequestState | null {
  let best: PullRequestState | null = null;
  for (const state of states) {
    if (best === null || BADGE_PRIORITY[state] < BADGE_PRIORITY[best]) best = state;
  }
  return best;
}

/** Событие PR, на которое реагирует автоматизация статусов. */
export type PullRequestTransition = 'opened' | 'merged';

/**
 * Переход, который запускает автосмену статуса: PR стал открытым (новый, из черновика, повторно
 * открыт) или слит. Черновик и закрытие без слияния статус не меняют. `previous` null — PR новый.
 */
export function pullRequestTransition(
  previous: PullRequestState | null,
  next: PullRequestState,
): PullRequestTransition | null {
  if (next === previous) return null;
  if (next === 'merged') return 'merged';
  if (next === 'open') return 'opened';
  return null;
}
