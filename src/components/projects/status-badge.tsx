import { statusTone, TONE_FILL, TONE_FILL_STRONG } from '@/components/design-system/tones';
import { cn } from '@/lib/utils';
import type { StatusColor } from '@/modules/projects/client';

// Цвета статусов — тона палитры (--tone-* в globals.css, см. design-system/tones.ts).

/** Класс заливки цветом статуса (полосы, сегменты). */
export function statusFillClass(color: StatusColor): string {
  return TONE_FILL[statusTone(color)];
}

/** Число на фоне цвета статуса, белым текстом (насыщенный тон: контраст ≈ 4.5:1 в обеих темах). */
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
        'inline-flex h-[1.125rem] min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold text-white tabular-nums',
        TONE_FILL_STRONG[statusTone(color)],
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
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        statusFillClass(color),
        className,
      )}
    />
  );
}
