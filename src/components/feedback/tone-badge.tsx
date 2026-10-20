import type { ReactNode } from 'react';

import {
  isPaletteTone,
  TONE_FILL,
  TONE_FILL_STRONG,
  TONE_SOFT,
  TONE_TEXT,
  type Tone,
} from '@/components/design-system/tones';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ToneBadgeProps {
  tone: Tone;
  children: ReactNode;
  /** Точка тона перед подписью; по умолчанию — у тонов палитры. */
  dot?: boolean;
  className?: string;
}

/**
 * Бейдж с тоном: мягкий фон и рамка тона. Семантические тона красят текст,
 * у тонов палитры текст обычный — цвет несёт точка (светлые тона плохо читаются текстом).
 */
export function ToneBadge({ tone, children, dot, className }: ToneBadgeProps) {
  const palette = isPaletteTone(tone);
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md',
        TONE_SOFT[tone],
        palette || tone === 'neutral' ? 'text-foreground' : TONE_TEXT[tone],
        className,
      )}
    >
      {(dot ?? palette) ? <ToneDot tone={tone} /> : null}
      {children}
    </Badge>
  );
}

/** Точка тона. strong — насыщенный вариант (только у тонов палитры). */
export function ToneDot({
  tone,
  strong = false,
  className,
}: {
  tone: Tone;
  strong?: boolean;
  className?: string;
}) {
  const fill = strong && isPaletteTone(tone) ? TONE_FILL_STRONG[tone] : TONE_FILL[tone];
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', fill, className)} />;
}
