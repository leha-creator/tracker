import type { ComponentProps, ElementType } from 'react';

import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
} as const;

export type PageContainerSize = keyof typeof SIZE_CLASSES;

type PageContainerProps<T extends ElementType> = {
  as?: T;
  size?: PageContainerSize;
} & Omit<ComponentProps<T>, 'as'>;

/** Горизонтальные границы страницы: одна ширина и одни отступы для шапки и контента. */
export function PageContainer<T extends ElementType = 'div'>({
  as,
  size = 'default',
  className,
  ...props
}: PageContainerProps<T>) {
  const Component: ElementType = as ?? 'div';
  return (
    <Component
      className={cn('mx-auto w-full px-4 sm:px-6', SIZE_CLASSES[size], className)}
      {...props}
    />
  );
}
