import Link from 'next/link';

import type { HelpArticleMeta } from '@/modules/help/client';

import { AudienceBadges } from './audience-badge';
import { helpArticleHref } from './help-href';

/** Карточка статьи в оглавлении справки. */
export function HelpArticleCard({ article }: { article: HelpArticleMeta }) {
  return (
    <Link
      href={helpArticleHref(article.slug)}
      className="grid content-start gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="font-medium">{article.title}</span>
      <span className="text-sm text-muted-foreground">{article.summary}</span>
      <AudienceBadges audience={article.audience} />
    </Link>
  );
}
