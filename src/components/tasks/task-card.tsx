import Link from 'next/link';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';
import type { BoardCardDto } from '@/modules/tasks/client';

import { AssigneeAvatar } from './assignee-avatar';
import { DueDate } from './due-date';
import { PriorityBadge } from './priority-badge';

type TaskCardProps = Omit<ComponentProps<typeof Link>, 'href' | 'children'> & {
  card: BoardCardDto;
  href: string;
};

/** Карточка задачи на доске: ссылка на страницу задачи (доп. пропсы — для перетаскивания). */
export function TaskCard({ card, href, className, ...props }: TaskCardProps) {
  return (
    <Link
      href={href}
      {...props}
      className={cn(
        'grid gap-2 rounded-lg border bg-background p-3 text-sm shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      <span className="line-clamp-3 font-medium break-words">{card.title}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">{card.key}</span>
        <PriorityBadge priority={card.priority} />
        {card.dueDate && <DueDate value={card.dueDate} isOverdue={card.isOverdue} />}
        {card.assignee && <AssigneeAvatar user={card.assignee} className="ml-auto" />}
      </span>
    </Link>
  );
}
