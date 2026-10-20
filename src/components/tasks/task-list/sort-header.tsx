'use client';

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toggleSort, type TaskListSort } from '@/modules/tasks/client';

import { useTaskList } from './task-list-shell';

interface SortHeaderProps {
  sort: TaskListSort;
  label: string;
  className?: string;
}

/** Заголовок сортируемой колонки: клик — сортировка по ней, повторный — смена направления. */
export function SortHeader({ sort, label, className }: SortHeaderProps) {
  const { query, navigate } = useTaskList();
  const active = query.sort === sort;
  const Icon = !active ? ArrowUpDownIcon : query.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;

  return (
    <TableHead
      className={className}
      aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => navigate(toggleSort(query, sort))}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </TableHead>
  );
}
