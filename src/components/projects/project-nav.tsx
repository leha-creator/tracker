'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

interface ProjectNavProps {
  basePath: string;
  name: string;
  description: string | null;
  canManage: boolean;
}

/** Шапка проекта с вкладками. «Настройки» скрыты без права управления — доступ проверяет страница. */
export function ProjectNav({ basePath, name, description, canManage }: ProjectNavProps) {
  const pathname = usePathname();
  const links = [
    { href: `${basePath}/board`, label: 'Доска' },
    ...(canManage ? [{ href: `${basePath}/settings`, label: 'Настройки' }] : []),
  ];

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold">{name}</h2>
        {description && (
          <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <nav aria-label="Разделы проекта" className="flex gap-1">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
