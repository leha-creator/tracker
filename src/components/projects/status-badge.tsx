import { cn } from '@/lib/utils';
import type { StatusColor } from '@/modules/projects/client';

// Полные имена классов: Tailwind находит их в исходниках, динамическая сборка не сработала бы.
// Приглушённые тона, одинаково читаемые в обеих темах; синий уведён от индиго-акцента.
const DOT_CLASSES: Record<StatusColor, string> = {
  gray: 'bg-[oklch(0.7_0.02_265)]',
  blue: 'bg-[oklch(0.68_0.11_230)]',
  green: 'bg-[oklch(0.68_0.12_160)]',
  amber: 'bg-[oklch(0.77_0.12_80)]',
  red: 'bg-[oklch(0.64_0.15_25)]',
  violet: 'bg-[oklch(0.62_0.12_305)]',
};

/** Класс заливки цветом статуса (полосы, сегменты). */
export function statusFillClass(color: StatusColor): string {
  return DOT_CLASSES[color];
}

// Те же тона, но темнее: белое число на них читается (контраст ≈ 4.5:1) в обеих темах.
const COUNT_CLASSES: Record<StatusColor, string> = {
  gray: 'bg-[oklch(0.55_0.02_265)]',
  blue: 'bg-[oklch(0.53_0.11_235)]',
  green: 'bg-[oklch(0.53_0.11_160)]',
  amber: 'bg-[oklch(0.58_0.12_70)]',
  red: 'bg-[oklch(0.55_0.17_25)]',
  violet: 'bg-[oklch(0.52_0.13_305)]',
};

/** Число на фоне цвета статуса, белым текстом. */
export function StatusCount({
  color,
  count,
  className,
}: {
  color: StatusColor;
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[1.125rem] min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold text-white tabular-nums',
        COUNT_CLASSES[color],
        className,
      )}
    >
      {count}
    </span>
  );
}

/** Цветной маркер статуса. */
export function StatusDot({ color, className }: { color: StatusColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT_CLASSES[color], className)}
    />
  );
}
