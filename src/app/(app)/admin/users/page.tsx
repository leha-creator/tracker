import Link from 'next/link';
import { Suspense } from 'react';

import { AdminUsersPagination } from '@/components/admin/users/admin-users-pagination';
import { adminUsersHref } from '@/components/admin/users/admin-users-href';
import { AdminUsersShell } from '@/components/admin/users/admin-users-shell';
import { AdminUsersTable } from '@/components/admin/users/admin-users-table';
import { AdminUsersToolbar } from '@/components/admin/users/admin-users-toolbar';
import { Button } from '@/components/ui/button';
import {
  clearAdminUserFilters,
  hasActiveAdminUserFilters,
  listAdminUsers,
  parseAdminUserListParams,
} from '@/modules/admin';
import { requireAdminOrNotFound } from '@/shared/access';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

type Props = PageProps<'/admin/users'>;

export default function AdminUsersPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <UsersSection searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersSection({ searchParams }: Pick<Props, 'searchParams'>) {
  await requireAdminOrNotFound('/admin/users');
  const query = parseAdminUserListParams(await searchParams);
  const list = await listAdminUsers(query);

  return (
    <AdminUsersShell query={query}>
      <AdminUsersToolbar />
      {list.items.length > 0 ? (
        <>
          <AdminUsersTable items={list.items} />
          <AdminUsersPagination list={list} query={query} />
        </>
      ) : (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground transition-opacity group-data-pending/users:opacity-60">
          {hasActiveAdminUserFilters(query) ? (
            <>
              <p>Пользователи не найдены. Измените поиск или фильтры.</p>
              <Button asChild variant="outline" size="sm">
                <Link href={adminUsersHref(clearAdminUserFilters(query))} scroll={false}>
                  Сбросить фильтры
                </Link>
              </Button>
            </>
          ) : (
            <p>На этой странице пользователей нет.</p>
          )}
        </div>
      )}
    </AdminUsersShell>
  );
}
