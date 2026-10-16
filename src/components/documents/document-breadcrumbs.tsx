import Link from 'next/link';
import { Fragment } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { FolderCrumbDto } from '@/modules/documents/client';

import { folderHref } from './docs-href';

/**
 * «Документы / Проект / Схемы». `current` — последний элемент без ссылки (название документа);
 * без него последней становится текущая папка.
 */
export function DocumentBreadcrumbs({
  workspaceSlug,
  path,
  current,
}: {
  workspaceSlug: string;
  path: FolderCrumbDto[];
  current?: string;
}) {
  const crumbs = [{ id: null as string | null, name: 'Документы' }, ...path];
  const lastLinked = current ? crumbs.length - 1 : crumbs.length - 2;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.id ?? 'root'}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {index <= lastLinked ? (
                <BreadcrumbLink asChild className="truncate">
                  <Link href={folderHref(workspaceSlug, crumb.id)}>{crumb.name}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{crumb.name}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
        {current && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{current}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
