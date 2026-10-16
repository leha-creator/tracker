import {
  CircleCheck,
  CircleDashed,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  ChecksState,
  PullRequestState,
  ReviewState,
} from '@/modules/integrations/github/client';

// Те же приглушённые тона, что у статусов проектов (status-badge.tsx): читаемы в обеих темах.
const STATE_STYLES: Record<
  PullRequestState,
  { icon: LucideIcon; label: string; className: string }
> = {
  open: { icon: GitPullRequest, label: 'Открыт', className: 'text-[oklch(0.6_0.13_160)]' },
  draft: { icon: GitPullRequestDraft, label: 'Черновик', className: 'text-muted-foreground' },
  merged: { icon: GitMerge, label: 'Слит', className: 'text-[oklch(0.58_0.14_305)]' },
  closed: {
    icon: GitPullRequestClosed,
    label: 'Закрыт',
    className: 'text-[oklch(0.6_0.16_25)]',
  },
};

export const PULL_REQUEST_STATE_LABELS: Record<PullRequestState, string> = {
  open: STATE_STYLES.open.label,
  draft: STATE_STYLES.draft.label,
  merged: STATE_STYLES.merged.label,
  closed: STATE_STYLES.closed.label,
};

/** Иконка состояния PR; подпись — для скринридера (или видимая рядом). */
export function PrStateIcon({
  state,
  className,
  label,
}: {
  state: PullRequestState;
  className?: string;
  /** Подпись для скринридера; по умолчанию «PR: <состояние>». */
  label?: string;
}) {
  const { icon: Icon, className: tone } = STATE_STYLES[state];
  return (
    <Icon
      role="img"
      aria-label={label ?? `PR: ${STATE_STYLES[state].label.toLowerCase()}`}
      className={cn('size-4 shrink-0', tone, className)}
    />
  );
}

/** Бейдж состояния PR с подписью. */
export function PrStateBadge({ state }: { state: PullRequestState }) {
  const { icon: Icon, label, className } = STATE_STYLES[state];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon aria-hidden className={cn('size-3.5', className)} />
      {label}
    </span>
  );
}

const REVIEW_LABELS: Record<Exclude<ReviewState, 'none'>, { label: string; className: string }> = {
  approved: { label: 'Одобрен', className: 'text-[oklch(0.6_0.13_160)]' },
  changes_requested: { label: 'Нужны изменения', className: 'text-[oklch(0.64_0.14_60)]' },
};

/** Итог ревью; без ревью — ничего. */
export function ReviewBadge({ state }: { state: ReviewState }) {
  if (state === 'none') return null;
  const { label, className } = REVIEW_LABELS[state];
  return <span className={cn('text-xs font-medium', className)}>{label}</span>;
}

const CHECKS: Record<
  Exclude<ChecksState, 'none'>,
  { icon: LucideIcon; label: string; className: string }
> = {
  pending: { icon: CircleDashed, label: 'CI выполняется', className: 'text-[oklch(0.7_0.12_80)]' },
  success: { icon: CircleCheck, label: 'CI пройден', className: 'text-[oklch(0.6_0.13_160)]' },
  failure: { icon: CircleX, label: 'CI упал', className: 'text-[oklch(0.6_0.16_25)]' },
};

/** Итог CI с подписью; без проверок — ничего. */
export function ChecksIndicator({ state }: { state: ChecksState }) {
  if (state === 'none') return null;
  const { icon: Icon, label, className } = CHECKS[state];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon aria-hidden className={cn('size-3.5', className)} />
      {label}
    </span>
  );
}
