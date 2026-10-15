import { CalendarDays } from 'lucide-react';

import { cn } from '@/lib/utils';

// Срок — дата без времени: форматируем в UTC, чтобы не сдвинуть день часовым поясом.
const SHORT = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDueDate(value: string, format: 'short' | 'long' = 'short'): string {
  return (format === 'short' ? SHORT : LONG).format(new Date(`${value}T00:00:00.000Z`));
}

/** Срок задачи; просроченный — красным. */
export function DueDate({
  value,
  isOverdue,
  format = 'short',
}: {
  value: string;
  isOverdue: boolean;
  format?: 'short' | 'long';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground',
      )}
    >
      <CalendarDays aria-hidden className="size-3.5" />
      <time dateTime={value}>{formatDueDate(value, format)}</time>
      {isOverdue && <span className="sr-only">(просрочено)</span>}
    </span>
  );
}
