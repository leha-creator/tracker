import { cn } from '@/lib/utils';
import type { StatusColor } from '@/modules/projects/client';

// Полные имена классов: Tailwind находит их в исходниках, динамическая сборка не сработала бы.
const DOT_CLASSES: Record<StatusColor, string> = {
  gray: 'bg-zinc-400',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
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
