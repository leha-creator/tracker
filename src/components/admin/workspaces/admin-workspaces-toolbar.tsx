import { SearchIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ADMIN_WORKSPACE_STATUS_LABELS,
  ADMIN_WORKSPACE_STATUSES,
  ADMIN_WORKSPACES_QUERY_MAX_LENGTH,
  patchAdminWorkspaceListQuery,
  type AdminWorkspaceListQuery,
  type AdminWorkspaceStatus,
} from '@/modules/admin/client';

import { adminWorkspacesHref } from './admin-workspaces-href';

/**
 * Поиск и фильтр архива. Без клиентского кода: поиск — GET-форма, статус — ссылки; сортировка
 * сохраняется скрытыми полями.
 */
export function AdminWorkspacesToolbar({ query }: { query: AdminWorkspaceListQuery }) {
  const statuses: (AdminWorkspaceStatus | null)[] = [null, ...ADMIN_WORKSPACE_STATUSES];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        role="search"
        aria-label="Поиск пространств"
        action="/admin/workspaces"
        className="relative w-full sm:w-72"
      >
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          defaultValue={query.q}
          maxLength={ADMIN_WORKSPACES_QUERY_MAX_LENGTH}
          placeholder="Название, адрес или ключ"
          aria-label="Поиск пространств"
          className="h-8 pl-8"
        />
        {query.status && <input type="hidden" name="status" value={query.status} />}
        {query.sort !== 'created' && <input type="hidden" name="sort" value={query.sort} />}
        <input type="hidden" name="dir" value={query.dir} />
      </form>
      <nav aria-label="Статус" className="flex gap-1 rounded-lg bg-muted p-1">
        {statuses.map((status) => {
          const active = query.status === status;
          return (
            <Link
              key={status ?? 'all'}
              href={adminWorkspacesHref(patchAdminWorkspaceListQuery(query, { status }))}
              aria-current={active ? 'page' : undefined}
              scroll={false}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm transition-colors',
                active
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {status ? ADMIN_WORKSPACE_STATUS_LABELS[status] : 'Все'}
            </Link>
          );
        })}
      </nav>
      {query.q && (
        <Button asChild variant="ghost" size="sm">
          <Link
            href={adminWorkspacesHref(patchAdminWorkspaceListQuery(query, { q: '' }))}
            scroll={false}
          >
            Сбросить поиск
          </Link>
        </Button>
      )}
    </div>
  );
}
