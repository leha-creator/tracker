'use client';

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  ADMIN_USER_SORT_LABELS,
  toggleAdminUserSort,
  type AdminUserSort,
} from '@/modules/admin/client';

import { useAdminUsers } from './admin-users-shell';

/** Заголовок сортируемой колонки: клик — сортировка по ней, повторный — смена направления. */
export function AdminUsersSortHeader({
  sort,
  className,
}: {
  sort: AdminUserSort;
  className?: string;
}) {
  const { query, navigate } = useAdminUsers();
  const active = query.sort === sort;
  const Icon = !active ? ArrowUpDownIcon : query.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;

  return (
    <TableHead
      className={className}
      aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => navigate(toggleAdminUserSort(query, sort))}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {ADMIN_USER_SORT_LABELS[sort]}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </TableHead>
  );
}
