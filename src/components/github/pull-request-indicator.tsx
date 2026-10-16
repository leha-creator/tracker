import type { PullRequestBadgeDto } from '@/modules/integrations/github/client';

import { PULL_REQUEST_STATE_LABELS, PrStateIcon } from './pr-state';

/** Индикатор PR на карточке доски и в строке списка: иконка состояния и число PR, если их несколько. */
export function PullRequestIndicator({ badge }: { badge: PullRequestBadgeDto }) {
  const state = PULL_REQUEST_STATE_LABELS[badge.state].toLowerCase();
  const label = badge.count > 1 ? `PR: ${badge.count}, главный — ${state}` : `PR: ${state}`;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
      <PrStateIcon state={badge.state} label={label} className="size-3.5" />
      {badge.count > 1 && <span aria-hidden>{badge.count}</span>}
    </span>
  );
}
