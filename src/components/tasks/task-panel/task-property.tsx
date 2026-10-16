import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Свойства задачи: «подпись — значение». Ширина считается от контейнера (`@container` у тела
 * панели или страницы): в узкой панели подпись встаёт над значением.
 */
export function TaskPropertyList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] gap-x-4 @sm:grid-cols-[8rem_minmax(0,1fr)] @sm:gap-y-0.5',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function TaskProperty({
  labelId,
  label,
  children,
  align = 'center',
}: {
  /** id подписи — значение ссылается на неё через `aria-labelledby`. */
  labelId?: string;
  label: string;
  children: ReactNode;
  /** Многострочное значение (проекты) — подпись по верхнему краю. */
  align?: 'center' | 'start';
}) {
  return (
    <>
      <dt
        id={labelId}
        className={cn(
          'flex pt-2 text-sm text-muted-foreground @sm:min-h-9 @sm:pt-0',
          align === 'center' ? '@sm:items-center' : '@sm:pt-2',
        )}
      >
        {label}
      </dt>
      <dd className="flex min-h-9 min-w-0 items-center">{children}</dd>
    </>
  );
}
