'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/workspaces', label: 'Пространства' },
  { href: '/admin/activity', label: 'Журнал' },
  { href: '/admin/integrations', label: 'Интеграции' },
  { href: '/admin/settings', label: 'Настройки' },
] as const;

/** Вкладки админки. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Разделы администрирования"
      className="flex w-fit gap-1 rounded-lg bg-muted p-1"
    >
      {LINKS.map((link) => {
        // «Обзор» (/admin) — префикс всех вкладок: активен только на своём адресе.
        const active =
          link.href === '/admin' ? pathname === link.href : pathname.startsWith(link.href);
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
