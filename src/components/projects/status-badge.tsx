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

/** Цветной маркер статуса. */
export function StatusDot({ color, className }: { color: StatusColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT_CLASSES[color], className)}
    />
  );
}
