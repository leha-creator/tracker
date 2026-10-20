import { cn } from '@/lib/utils';

import { MARK_CHECK, MARK_TILE, MARK_VIEWBOX } from './mark-geometry';

const MARK_SIZES = {
  sm: 'size-6',
  md: 'size-7',
  lg: 'size-10',
} as const;

const WORDMARK_SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
} as const;

export type LogoSize = keyof typeof MARK_SIZES;

interface LogoMarkProps {
  size?: LogoSize;
  /** color — плитка цвета акцента; mono — плитка цветом текста (currentColor), галочка вырезана. */
  variant?: 'color' | 'mono';
  className?: string;
}

/** Знак Tasker: галочка в скруглённой плитке. Декоративный: доступное имя даёт обёртка. */
export function LogoMark({ size = 'md', variant = 'color', className }: LogoMarkProps) {
  const mono = variant === 'mono';
  return (
    <svg
      aria-hidden
      viewBox={MARK_VIEWBOX}
      className={cn(
        'shrink-0',
        MARK_SIZES[size],
        mono ? 'text-current' : 'text-primary',
        className,
      )}
    >
      <rect
        width={MARK_TILE.size}
        height={MARK_TILE.size}
        rx={MARK_TILE.radius}
        fill="currentColor"
      />
      <path
        d={MARK_CHECK.d}
        fill="none"
        strokeWidth={MARK_CHECK.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={mono ? 'stroke-background' : 'stroke-primary-foreground'}
      />
    </svg>
  );
}

interface LogoProps extends LogoMarkProps {
  /** На мобильных слово остаётся только для скринридера. */
  hideWordmarkOnMobile?: boolean;
}

/** Знак и слово «Tasker» по горизонтали. */
export function Logo({ size = 'md', variant, hideWordmarkOnMobile = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} variant={variant} />
      <span
        className={cn(
          'font-semibold tracking-tight',
          WORDMARK_SIZES[size],
          hideWordmarkOnMobile && 'max-sm:sr-only',
        )}
      >
        Tasker
      </span>
    </span>
  );
}
