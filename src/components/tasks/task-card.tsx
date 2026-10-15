import Link from 'next/link';

import type { BoardCardDto } from '@/modules/tasks/client';

import { AssigneeAvatar } from './assignee-avatar';
import { DueDate } from './due-date';
import { PriorityBadge } from './priority-badge';

/** Карточка задачи на доске: ссылка на страницу задачи. */
export function TaskCard({ card, href }: { card: BoardCardDto; href: string }) {
  return (
    <Link
      href={href}
      className="grid gap-2 rounded-lg border bg-background p-3 text-sm shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
