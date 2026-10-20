import Link from 'next/link';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { clearFilters, type TaskListQuery, type TaskListScope } from '@/modules/tasks/client';

import { taskListHref } from './task-list-href';

interface TaskListEmptyProps {
  /** Есть активные фильтры: тогда «Ничего не найдено» вместо пустого списка. */
  filtered: boolean;
  query: TaskListQuery;
  scope: TaskListScope;
  basePath: string;
  /** Текст для пустого списка без фильтров. */
  title: ReactNode;
  description?: ReactNode;
  /** Действия для пустого списка без фильтров. */
  action?: ReactNode;
}

export function TaskListEmpty({
  filtered,
  query,
  scope,
  basePath,
  title,
  description,
  action,
}: TaskListEmptyProps) {
  const className = 'transition-opacity group-data-pending/list:opacity-60';
  if (query.archived && !filtered) {
    return (
      <EmptyState
        className={className}
        title="В архиве нет задач."
        action={
          <Button asChild variant="outline" size="sm">
            <Link
              href={taskListHref(basePath, { ...query, archived: false, page: 1 }, scope)}
              scroll={false}
            >
              К активным задачам
            </Link>
          </Button>
        }
      />
    );
  }
  if (filtered) {
    return (
      <EmptyState
        className={className}
        title="Ничего не найдено"
        description="Измените поиск или фильтры."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={taskListHref(basePath, clearFilters(query, scope), scope)} scroll={false}>
              Сбросить фильтры
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState className={className} title={title} description={description} action={action} />
  );
}
