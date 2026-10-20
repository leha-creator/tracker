import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ActivityFeed } from '@/components/api-tokens/activity-feed';
import { SectionHeading } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { listTokenActivity, parseActivityCursor } from '@/modules/api-tokens';
import { requireUserOrRedirect } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Журнал токена — Tasker' };

type Props = PageProps<'/profile/tokens/[tokenId]'>;

export default function TokenActivityPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
      <TokenActivity params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TokenActivity({ params, searchParams }: Props) {
  const [{ tokenId }, query] = await Promise.all([params, searchParams]);
  const session = await requireUserOrRedirect(`/profile/tokens/${tokenId}`);
  const result = await listTokenActivity(session, tokenId, parseActivityCursor(query.cursor)).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );

  return (
    <section aria-labelledby="token-activity-heading" className="grid gap-3">
      <Link
        href="/profile/tokens"
        className="w-fit text-sm text-muted-foreground hover:text-foreground"
      >
        ← Токены доступа
      </Link>
      <div className="grid gap-1">
        <SectionHeading
          id="token-activity-heading"
          title={`Журнал токена «${result.token.name}»`}
        />
        <p className="text-sm text-muted-foreground">
          Изменения, которые агент сделал этим токеном в пространстве{' '}
          {`«${result.token.workspace.name}»`}. Записи хранятся 90 дней.
        </p>
      </div>
      <ActivityFeed
        page={result.page}
        workspaceSlug={result.token.workspace.slug}
        nextHref={(cursor) => `/profile/tokens/${tokenId}?cursor=${encodeURIComponent(cursor)}`}
      />
    </section>
  );
}
