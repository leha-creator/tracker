import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import {
  ADMIN_USERS_PAGE_SIZE,
  patchAdminUserListQuery,
  type AdminUserListDto,
  type AdminUserListQuery,
} from '@/modules/admin/client';
import { pageBounds, paginationRange } from '@/modules/tasks/client';

import { adminUsersHref } from './admin-users-href';

/** «Показано 51–100 из 230» и ссылки на страницы (фильтры и сортировка сохраняются). */
export function AdminUsersPagination({
  list,
  query,
}: {
  list: AdminUserListDto;
  query: AdminUserListQuery;
}) {
  const { from, to } = pageBounds(list.page, list.total, ADMIN_USERS_PAGE_SIZE);
  const hrefFor = (target: number) =>
    adminUsersHref(patchAdminUserListQuery(query, { page: target }));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Показано {from}–{to} из {list.total}
      </p>
      {list.pageCount > 1 && (
        <Pagination aria-label="Страницы списка пользователей" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <StepLink
                href={list.page > 1 ? hrefFor(list.page - 1) : null}
                label="Предыдущая страница"
              >
                <ChevronLeftIcon />
                <span className="hidden sm:inline">Назад</span>
              </StepLink>
            </PaginationItem>
            {paginationRange(list.page, list.pageCount).map((item, index) => (
              <PaginationItem key={item === 'ellipsis' ? `ellipsis-${index}` : item}>
                {item === 'ellipsis' ? (
                  <span aria-hidden className="px-2 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    asChild
                    size="icon"
                    variant={item === list.page ? 'outline' : 'ghost'}
                    className="tabular-nums"
                  >
                    <Link
                      href={hrefFor(item)}
                      scroll={false}
                      aria-current={item === list.page ? 'page' : undefined}
                      aria-label={`Страница ${item}`}
                    >
                      {item}
                    </Link>
                  </Button>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <StepLink
                href={list.page < list.pageCount ? hrefFor(list.page + 1) : null}
                label="Следующая страница"
              >
                <span className="hidden sm:inline">Вперёд</span>
                <ChevronRightIcon />
              </StepLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function StepLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="ghost" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost">
      <Link href={href} scroll={false} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
