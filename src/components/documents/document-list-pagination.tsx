import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import {
  patchDocumentListQuery,
  type DocumentListPageDto,
  type DocumentListQuery,
} from '@/modules/documents/client';
import { pageBounds, paginationRange } from '@/modules/tasks/client';

import { docsHref } from './docs-href';

/** «Показано 51–100 из 230» и ссылки на страницы (фильтры и сортировка сохраняются). */
export function DocumentListPagination({
  workspaceSlug,
  page,
  query,
}: {
  workspaceSlug: string;
  page: DocumentListPageDto;
  query: DocumentListQuery;
}) {
  const { from, to } = pageBounds(page.page, page.total, page.pageSize);
  const hrefFor = (target: number) =>
    docsHref(workspaceSlug, patchDocumentListQuery(query, { page: target }));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Документы {from}–{to} из {page.total}
      </p>
      {page.pageCount > 1 && (
        <Pagination aria-label="Страницы документов" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              {page.page > 1 ? (
                <Button asChild variant="ghost" size="icon" aria-label="Предыдущая страница">
                  <Link href={hrefFor(page.page - 1)}>
                    <ChevronLeftIcon />
                  </Link>
                </Button>
              ) : (
                <Button variant="ghost" size="icon" disabled aria-label="Предыдущая страница">
                  <ChevronLeftIcon />
                </Button>
              )}
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
              {page.page < page.pageCount ? (
                <Button asChild variant="ghost" size="icon" aria-label="Следующая страница">
                  <Link href={hrefFor(page.page + 1)}>
                    <ChevronRightIcon />
                  </Link>
                </Button>
              ) : (
                <Button variant="ghost" size="icon" disabled aria-label="Следующая страница">
                  <ChevronRightIcon />
                </Button>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
