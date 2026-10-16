'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/integrations', label: 'Интеграции' },
] as const;

/** Вкладки админки. Раздел «Пространства» появится следующим планом этапа. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Разделы администрирования"
      className="flex w-fit gap-1 rounded-lg bg-muted p-1"
    >
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-background font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
