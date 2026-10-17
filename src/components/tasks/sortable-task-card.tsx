'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MouseEvent } from 'react';

import { cn } from '@/lib/utils';
import type { PullRequestBadgeDto } from '@/modules/integrations/github/client';
import type { BoardCardDto } from '@/modules/tasks/client';

import { TaskCard } from './task-card';

interface SortableTaskCardProps {
  card: BoardCardDto;
  statusId: string;
  href: string;
  /** Задача открыта в панели. */
  active?: boolean;
  pullRequest?: PullRequestBadgeDto;
  /** true сразу после перетаскивания: клик, завершивший перенос, не должен открывать задачу. */
  shouldSuppressClick: () => boolean;
  reduceMotion: boolean;
  /** Доска архивного проекта: карточка — обычная ссылка, без перетаскивания. */
  disabled?: boolean;
}

/**
 * Карточка доски, которую можно перетаскивать: указателем (после сдвига), касанием (после
 * удержания) или с клавиатуры (Space). Обычный клик и Enter открывают задачу.
 */
export function SortableTaskCard({
  card,
  statusId,
  href,
  active,
  pullRequest,
  shouldSuppressClick,
  reduceMotion,
  disabled = false,
}: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.taskId,
    data: { statusId },
    disabled,
    transition: reduceMotion ? null : undefined,
  });
  // Ссылка остаётся ссылкой: без role="button", tabIndex и aria-pressed от dnd-kit.
  const { 'aria-describedby': describedBy } = attributes;

  return (
    <TaskCard
      ref={setNodeRef}
      card={card}
      href={href}
      active={active}
      pullRequest={pullRequest}
      {...listeners}
      aria-describedby={describedBy}
      aria-roledescription={disabled ? undefined : 'перетаскиваемая карточка'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-40')}
      onClickCapture={(event: MouseEvent) => {
        if (shouldSuppressClick()) event.preventDefault();
      }}
    />
  );
}
