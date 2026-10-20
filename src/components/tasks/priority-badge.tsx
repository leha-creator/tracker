import { priorityTone, TONE_TEXT } from '@/components/design-system/tones';
import { cn } from '@/lib/utils';
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@/modules/tasks/client';

import { isPriorityProminent, priorityLevel } from './priority-level';

const BARS = [0, 1, 2];

interface PriorityBadgeProps {
  priority: TaskPriority;
  /** Компактно (карточка доски): подпись видна только у высокого и срочного, у остальных — sr-only. */
  compact?: boolean;
  className?: string;
}

/** Индикатор приоритета: три деления и подпись. «Без приоритета» не показывается. */
export function PriorityBadge({ priority, compact = false, className }: PriorityBadgeProps) {
  if (priority === 'none') return null;
  const level = priorityLevel(priority);
  const label = TASK_PRIORITY_LABELS[priority];
  const showLabel = !compact || isPriorityProminent(priority);

  return (
    <span
      title={`Приоритет: ${label}`}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        TONE_TEXT[priorityTone(priority)],
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0" fill="currentColor">
        {BARS.map((bar) => (
          <rect
            key={bar}
            x={1 + bar * 3.75}
            y={8 - bar * 3}
            width={2.5}
            height={3 + bar * 3}
            rx={0.75}
            opacity={bar < level ? 1 : 0.25}
          />
        ))}
      </svg>
      <span className={showLabel ? undefined : 'sr-only'}>{label}</span>
    </span>
  );
}
