import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { clearFilters, type TaskListQuery, type TaskListScope } from '@/modules/tasks/client';

import { taskListHref } from './task-list-href';

interface TaskListEmptyProps {
  /** Есть активные фильтры: тогда «Ничего не найдено» вместо пустого списка. */
  filtered: boolean;
  query: TaskListQuery;
  scope: TaskListScope;
  basePath: string;
  /** Текст и действия для пустого списка без фильтров. */
  children: ReactNode;
}

export function TaskListEmpty({ filtered, query, scope, basePath, children }: TaskListEmptyProps) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground transition-opacity group-data-pending/list:opacity-60">
      {query.archived && !filtered ? (
        <>
          <p>В архиве нет задач.</p>
          <Button asChild variant="outline" size="sm">
            <Link
              href={taskListHref(basePath, { ...query, archived: false, page: 1 }, scope)}
              scroll={false}
            >
              К активным задачам
            </Link>
          </Button>
        </>
      ) : filtered ? (
        <>
          <p>Ничего не найдено. Измените поиск или фильтры.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={taskListHref(basePath, clearFilters(query, scope), scope)} scroll={false}>
              Сбросить фильтры
            </Link>
          </Button>
        </>
      ) : (
        children
      )}
    </div>
  );
}
