import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import {
  pageBounds,
  paginationRange,
  patchTaskListQuery,
  type TaskListPageDto,
  type TaskListQuery,
  type TaskListScope,
} from '@/modules/tasks/client';

import { taskListHref } from './task-list-href';

interface TaskListPaginationProps {
  page: TaskListPageDto;
  query: TaskListQuery;
  scope: TaskListScope;
  basePath: string;
}

/** «Показано 51–100 из 230» и ссылки на страницы (фильтры и сортировка сохраняются). */
export function TaskListPagination({ page, query, scope, basePath }: TaskListPaginationProps) {
  const { from, to } = pageBounds(page.page, page.total, page.pageSize);
  const hrefFor = (target: number) =>
    taskListHref(basePath, patchTaskListQuery(query, { page: target }), scope);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Показано {from}–{to} из {page.total}
      </p>
      {page.pageCount > 1 && (
        <Pagination aria-label="Страницы списка задач" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <StepLink
                href={page.page > 1 ? hrefFor(page.page - 1) : null}
                label="Предыдущая страница"
              >
                <ChevronLeftIcon />
                <span className="hidden sm:inline">Назад</span>
              </StepLink>
            </PaginationItem>
            {paginationRange(page.page, page.pageCount).map((item, index) => (
              <PaginationItem key={item === 'ellipsis' ? `ellipsis-${index}` : item}>
                {item === 'ellipsis' ? (
                  <span aria-hidden className="px-2 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    asChild
                    size="icon"
                    variant={item === page.page ? 'outline' : 'ghost'}
                    className="tabular-nums"
                  >
                    <Link
                      href={hrefFor(item)}
                      scroll={false}
                      aria-current={item === page.page ? 'page' : undefined}
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
                href={page.page < page.pageCount ? hrefFor(page.page + 1) : null}
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
