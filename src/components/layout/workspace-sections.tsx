'use client';

import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { WorkspaceListItemDto } from '@/modules/workspaces/client';

import { currentWorkspaceSlug, getWorkspaceSections } from './nav-items';
import { TabLink } from './tab-link';

interface WorkspaceSectionsProps {
  items: WorkspaceListItemDto[];
  className?: string;
}

/** Разделы текущего пространства в шапке. Вне `/w/*` и в чужом пространстве не рендерится. */
export function WorkspaceSections({ items, className }: WorkspaceSectionsProps) {
  const pathname = usePathname();
  const slug = currentWorkspaceSlug(pathname);
  const current = items.find((item) => item.slug === slug);
  if (!current) return null;

  return (
    <nav
      aria-label="Разделы пространства"
      className={cn('no-scrollbar flex gap-5 overflow-x-auto', className)}
    >
      {getWorkspaceSections(current.slug, current.role).map((section) => (
        <TabLink
          key={section.href}
          href={section.href}
          active={section.isActive(pathname)}
          className="h-11 sm:h-14"
        >
          {section.label}
        </TabLink>
      ))}
    </nav>
  );
}
