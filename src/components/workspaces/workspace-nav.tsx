'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { WorkspaceRole } from '@/shared/access/workspace-role';

import { WORKSPACE_ROLE_LABELS } from './role-label';

interface WorkspaceNavProps {
  slug: string;
  name: string;
  role: WorkspaceRole;
}

function isProjectsPath(base: string, path: string): boolean {
  return path === base || path.startsWith(`${base}/projects`);
}

/** Навигация пространства. Ссылка «Настройки» скрыта для участников ради UX — доступ проверяет страница. */
export function WorkspaceNav({ slug, name, role }: WorkspaceNavProps) {
  const pathname = usePathname();
  const base = `/w/${slug}`;
  const links = [
    { href: base, label: 'Проекты', isActive: (path: string) => isProjectsPath(base, path) },
    {
      href: `${base}/tasks`,
      label: 'Задачи',
      isActive: (path: string) => path.startsWith(`${base}/tasks`),
    },
    {
      href: `${base}/settings/members`,
      label: 'Участники',
      isActive: (path: string) => path.startsWith(`${base}/settings/members`),
    },
    ...(role === 'owner'
      ? [
          {
            href: `${base}/settings`,
            label: 'Настройки',
            isActive: (path: string) => path === `${base}/settings`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold">{name}</h1>
        <p className="text-sm text-muted-foreground">Ваша роль: {WORKSPACE_ROLE_LABELS[role]}</p>
      </div>
      <nav aria-label="Разделы пространства" className="flex gap-1 rounded-lg bg-muted p-1">
        {links.map((link) => {
          const active = link.isActive(pathname);
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
    </div>
  );
}
