import { StatusDot } from '@/components/projects/status-badge';
import { cn } from '@/lib/utils';
import { TASK_LABELS_ON_CARD, type TaskLabelRefDto } from '@/modules/tasks/client';

/** Метка: цветная точка и имя на нейтральной подложке — читается в обеих темах. */
export function LabelChip({
  label,
  className,
}: {
  label: Pick<TaskLabelRefDto, 'name' | 'color'>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-40 min-w-0 items-center gap-1 rounded-full border bg-background px-1.5 text-xs leading-none text-foreground/90',
        className,
      )}
    >
      <StatusDot color={label.color} className="size-2" />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** Первые метки и «+N» для остальных (карточка доски, строка списка). */
export function LabelChipList({
  labels,
  limit = TASK_LABELS_ON_CARD,
  className,
}: {
  labels: TaskLabelRefDto[];
  limit?: number;
  className?: string;
}) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, limit);
  const rest = labels.slice(limit);
  return (
    <ul className={cn('flex min-w-0 flex-wrap items-center gap-1', className)} aria-label="Метки">
      {shown.map((label) => (
        <li key={label.id} className="min-w-0">
          <LabelChip label={label} />
        </li>
      ))}
      {rest.length > 0 && (
        <li
          className="text-xs text-muted-foreground tabular-nums"
          title={rest.map((label) => label.name).join(', ')}
        >
          +{rest.length}
        </li>
      )}
    </ul>
  );
}
