'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

import { StatusRow } from './status-row';

type SortableStatusRowProps = Omit<
  ComponentProps<typeof StatusRow>,
  'handle' | 'ref' | 'style' | 'isDragging'
> & {
  /** Перестановка недоступна (сохраняется предыдущая). */
  dragDisabled: boolean;
  reduceMotion: boolean;
};

/** Строка статуса, которую перетаскивают только за ручку — поля строки работают как обычно. */
export function SortableStatusRow({
  dragDisabled,
  reduceMotion,
  ...props
}: SortableStatusRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.status.id,
    disabled: dragDisabled,
    transition: reduceMotion ? null : undefined,
  });

  return (
    <StatusRow
      {...props}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      isDragging={isDragging}
      handle={
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Перетащить статус «${props.status.name}»`}
          aria-roledescription="перетаскиваемый статус"
          disabled={dragDisabled}
          className={cn(
            'flex size-7 touch-none items-center justify-center rounded-md text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-40',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <GripVertical className="size-4" />
        </button>
      }
    />
  );
}
