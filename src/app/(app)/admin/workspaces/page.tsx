import Link from 'next/link';
import { Suspense } from 'react';

import { adminWorkspacesHref } from '@/components/admin/workspaces/admin-workspaces-href';
import { AdminWorkspacesPagination } from '@/components/admin/workspaces/admin-workspaces-pagination';
import { AdminWorkspacesTable } from '@/components/admin/workspaces/admin-workspaces-table';
import { AdminWorkspacesToolbar } from '@/components/admin/workspaces/admin-workspaces-toolbar';
import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
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
        <EmptyState
          {...(hasActiveAdminWorkspaceFilters(query)
            ? {
                title: 'Пространства не найдены',
                description: 'Измените поиск или фильтр.',
                action: (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={adminWorkspacesHref(defaultAdminWorkspaceListQuery())}
                      scroll={false}
                    >
                      Сбросить фильтры
                    </Link>
                  </Button>
                ),
              }
            : { title: 'На этой странице пространств нет.' })}
        />
      )}
    </div>
  );
}
