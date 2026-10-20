import { CornerDownRight, ListChecks } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';

import { UserHoverCard } from '@/components/users/user-hover-card';
import { cn } from '@/lib/utils';
import type { BoardCardDto } from '@/modules/tasks/client';

import { PullRequestIndicator } from '@/components/github/pull-request-indicator';
import type { PullRequestBadgeDto } from '@/modules/integrations/github/client';

import { AssigneeAvatar } from './assignee-avatar';
import { DueDate } from './due-date';
import { LabelChipList } from './labels/label-chip';
import { PriorityBadge } from './priority-badge';

type TaskCardProps = Omit<ComponentProps<typeof Link>, 'href' | 'children'> & {
  card: BoardCardDto;
  href: string;
  /** Задача открыта в панели справа — карточка подсвечена. */
  active?: boolean;
  /** PR задачи (интеграция GitHub); нет — без индикатора. */
  pullRequest?: PullRequestBadgeDto;
};

/** Карточка задачи на доске: открывает задачу в панели (доп. пропсы — для перетаскивания). */
export function TaskCard({ card, href, active, pullRequest, className, ...props }: TaskCardProps) {
  return (
    <Link
      href={href}
      // Открытие панели не прокручивает доску к началу.
      scroll={false}
      aria-current={active || undefined}
      {...props}
      className={cn(
        // relative — чтобы sr-only подписи внутри не позиционировались относительно страницы.
        'relative grid gap-2 rounded-lg bg-card p-3 text-sm shadow-card transition-[box-shadow,translate,scale,opacity] duration-200 ease-out hover:shadow-card-hover',
        'motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99]',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active && 'ring-2 ring-primary/50',
        className,
      )}
    >
      {card.parent && (
        <span
          className="-mb-1 flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground"
          title={`Подзадача ${card.parent.key} «${card.parent.title}»`}
        >
          <CornerDownRight aria-hidden className="size-3 shrink-0 self-center" />
          <span className="sr-only">Подзадача</span>
          <span className="shrink-0 font-mono text-2xs tabular-nums">{card.parent.key}</span>
          <span className="truncate">{card.parent.title}</span>
        </span>
      )}
      <span className="line-clamp-3 font-medium break-words">{card.title}</span>
      <LabelChipList labels={card.labels} />
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs text-muted-foreground tabular-nums">{card.key}</span>
        {pullRequest && <PullRequestIndicator badge={pullRequest} />}
        {card.subtaskProgress && (
          <span
            className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground tabular-nums"
            title={`Подзадачи: выполнено ${card.subtaskProgress.done} из ${card.subtaskProgress.total}`}
          >
            <ListChecks aria-hidden className="size-3.5" />
            {card.subtaskProgress.done}/{card.subtaskProgress.total}
            <span className="sr-only"> подзадач выполнено</span>
          </span>
        )}
        <PriorityBadge priority={card.priority} compact />
        {card.dueDate && <DueDate value={card.dueDate} isOverdue={card.isOverdue} />}
        {card.assignee && (
          // Внутри ссылки карточки триггер не фокусируемый: предпросмотр — наведением указателя.
          <UserHoverCard user={card.assignee} focusable={false} className="ml-auto">
            <AssigneeAvatar user={card.assignee} />
          </UserHoverCard>
        )}
      </span>
    </Link>
  );
}
