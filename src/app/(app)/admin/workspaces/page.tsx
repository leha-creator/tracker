import Link from 'next/link';
import { Suspense } from 'react';

import { adminWorkspacesHref } from '@/components/admin/workspaces/admin-workspaces-href';
import { AdminWorkspacesPagination } from '@/components/admin/workspaces/admin-workspaces-pagination';
import { AdminWorkspacesTable } from '@/components/admin/workspaces/admin-workspaces-table';
import { AdminWorkspacesToolbar } from '@/components/admin/workspaces/admin-workspaces-toolbar';
import { Button } from '@/components/ui/button';
import {
  defaultAdminWorkspaceListQuery,
  hasActiveAdminWorkspaceFilters,
  listAdminWorkspaces,
  parseAdminWorkspaceListParams,
} from '@/modules/admin';
import { requireAdminOrNotFound } from '@/shared/access';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

type Props = PageProps<'/admin/workspaces'>;

export default function AdminWorkspacesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <WorkspacesSection searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkspacesSection({ searchParams }: Pick<Props, 'searchParams'>) {
  await requireAdminOrNotFound('/admin/workspaces');
  const query = parseAdminWorkspaceListParams(await searchParams);
  const list = await listAdminWorkspaces(query);

  return (
    <div className="grid gap-3">
      <AdminWorkspacesToolbar query={query} />
      {list.items.length > 0 ? (
        <>
          <AdminWorkspacesTable items={list.items} query={query} />
          <AdminWorkspacesPagination list={list} query={query} />
        </>
      ) : (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {hasActiveAdminWorkspaceFilters(query) ? (
            <>
              <p>Пространства не найдены. Измените поиск или фильтр.</p>
              <Button asChild variant="outline" size="sm">
                <Link href={adminWorkspacesHref(defaultAdminWorkspaceListQuery())} scroll={false}>
                  Сбросить фильтры
                </Link>
              </Button>
            </>
          ) : (
            <p>На этой странице пространств нет.</p>
          )}
        </div>
      )}
    </div>
  );
}
