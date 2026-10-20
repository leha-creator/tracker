import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { HelpArticleMeta } from '@/modules/help/client';

import { helpArticleHref } from './help-href';

function PagerLink({
  article,
  direction,
}: {
  article: HelpArticleMeta;
  direction: 'prev' | 'next';
}) {
  const next = direction === 'next';
  return (
    <Link
      href={helpArticleHref(article.slug)}
      rel={direction}
      className={cn(
        'grid min-w-0 gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        next && 'text-right sm:col-start-2',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1 text-xs text-muted-foreground',
          next && 'justify-end',
        )}
      >
        {next ? null : <ArrowLeftIcon aria-hidden className="size-3.5" />}
        {next ? 'Следующая' : 'Предыдущая'}
        {next ? <ArrowRightIcon aria-hidden className="size-3.5" /> : null}
      </span>
      <span className="truncate text-sm font-medium">{article.title}</span>
    </Link>
  );
}

/** «Предыдущая / Следующая» внизу статьи — в порядке каталога. */
export function HelpPager({
  prev,
  next,
}: {
  prev: HelpArticleMeta | null;
  next: HelpArticleMeta | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Соседние статьи" className="grid gap-3 border-t pt-6 sm:grid-cols-2">
      {prev ? <PagerLink article={prev} direction="prev" /> : null}
      {next ? <PagerLink article={next} direction="next" /> : null}
    </nav>
  );
}
