import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface TabLinkProps {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

/** Вкладка навигации: текст с акцентной полосой снизу у активной. Один стиль на всё приложение. */
export function TabLink({ href, active, children, className }: TabLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-sm text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity',
        active && 'text-foreground after:opacity-100',
        className,
      )}
    >
      {children}
    </Link>
  );
}
