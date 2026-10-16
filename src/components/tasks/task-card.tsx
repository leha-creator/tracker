import Link from 'next/link';
import type { ComponentProps } from 'react';

import { UserHoverCard } from '@/components/users/user-hover-card';
import { cn } from '@/lib/utils';
import type { BoardCardDto } from '@/modules/tasks/client';

import { AssigneeAvatar } from './assignee-avatar';
import { DueDate } from './due-date';
import { PriorityBadge } from './priority-badge';

type TaskCardProps = Omit<ComponentProps<typeof Link>, 'href' | 'children'> & {
  card: BoardCardDto;
  href: string;
  /** Задача открыта в панели справа — карточка подсвечена. */
  active?: boolean;
};

/** Карточка задачи на доске: открывает задачу в панели (доп. пропсы — для перетаскивания). */
export function TaskCard({ card, href, active, className, ...props }: TaskCardProps) {
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
      <span className="line-clamp-3 font-medium break-words">{card.title}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{card.key}</span>
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
