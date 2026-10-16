'use client';

import { usePathname } from 'next/navigation';

import { currentWorkspaceSlug } from '@/components/layout/nav-items';
import { NotFoundMessage } from '@/components/layout/not-found-message';

/** 404 внутри пространства (недоступный проект, задача, раздел): шапка и разделы остаются. */
export default function WorkspaceNotFound() {
  const slug = currentWorkspaceSlug(usePathname());
  return (
    <NotFoundMessage
      primary={
        slug
          ? { href: `/w/${slug}`, label: 'К проектам пространства' }
          : { href: '/', label: 'К пространствам' }
      }
      secondary={slug ? { href: '/', label: 'Все пространства' } : undefined}
    />
  );
}
