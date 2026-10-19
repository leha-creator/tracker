import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  ADMIN_WORKSPACES_PAGE_SIZE,
  patchAdminWorkspaceListQuery,
  type AdminWorkspaceListDto,
  type AdminWorkspaceListQuery,
} from '@/modules/admin/client';
import { pageBounds } from '@/modules/tasks/client';

import { adminWorkspacesHref } from './admin-workspaces-href';

/** «Показано 51–100 из 230» и переход на соседние страницы. */
export function AdminWorkspacesPagination({
  list,
  query,
}: {
  list: AdminWorkspaceListDto;
  query: AdminWorkspaceListQuery;
}) {
  const { from, to } = pageBounds(list.page, list.total, ADMIN_WORKSPACES_PAGE_SIZE);
  const hrefFor = (page: number) =>
    adminWorkspacesHref(patchAdminWorkspaceListQuery(query, { page }));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Показано {from}–{to} из {list.total}
      </p>
      {list.pageCount > 1 && (
        <nav aria-label="Страницы списка пространств" className="flex items-center gap-1">
          <Button asChild={list.page > 1} variant="ghost" disabled={list.page <= 1}>
            {list.page > 1 ? (
              <Link href={hrefFor(list.page - 1)} scroll={false} aria-label="Предыдущая страница">
                <ChevronLeftIcon />
                Назад
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon />
                Назад
              </span>
            )}
          </Button>
          <span className="px-2 text-sm text-muted-foreground tabular-nums">
            {list.page} из {list.pageCount}
          </span>
          <Button
            asChild={list.page < list.pageCount}
            variant="ghost"
            disabled={list.page >= list.pageCount}
          >
            {list.page < list.pageCount ? (
              <Link href={hrefFor(list.page + 1)} scroll={false} aria-label="Следующая страница">
                Вперёд
                <ChevronRightIcon />
              </Link>
            ) : (
              <span>
                Вперёд
                <ChevronRightIcon />
              </span>
            )}
          </Button>
        </nav>
      )}
    </div>
  );
}
