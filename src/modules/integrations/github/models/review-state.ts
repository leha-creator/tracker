/** Итог ревью PR (enum GithubReviewState в схеме). */
export type ReviewState = 'none' | 'approved' | 'changes_requested';

/** Последнее значимое ревью ревьюера (GithubPullRequestReview.state). */
export type ReviewerState = 'approved' | 'changes_requested' | 'commented' | 'dismissed';

/** `pull_request_review.review.state` из вебхука (регистр в GitHub разный) → состояние ревьюера. */
export function toReviewerState(raw: string): ReviewerState | null {
  switch (raw.toLowerCase()) {
    case 'approved':
      return 'approved';
    case 'changes_requested':
      return 'changes_requested';
    case 'commented':
      return 'commented';
    case 'dismissed':
      return 'dismissed';
    default:
      return null;
  }
}

/**
 * Новое состояние ревьюера: комментарий после одобрения или запроса изменений их не отменяет
 * (как в GitHub), а снятое ревью (dismissed) — отменяет.
 */
export function mergeReviewerState(
  current: ReviewerState | null,
  incoming: ReviewerState,
): ReviewerState {
  if (incoming === 'commented' && (current === 'approved' || current === 'changes_requested')) {
    return current;
  }
  return incoming;
}

/** Итог по ревьюерам: хоть один «нужны изменения» → changes_requested, иначе хоть одно одобрение → approved. */
export function aggregateReviewState(reviewers: readonly { state: string }[]): ReviewState {
  let approved = false;
  for (const { state } of reviewers) {
    if (state === 'changes_requested') return 'changes_requested';
    if (state === 'approved') approved = true;
  }
  return approved ? 'approved' : 'none';
}
