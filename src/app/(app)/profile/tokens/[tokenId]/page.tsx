import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ActivityFeed } from '@/components/api-tokens/activity-feed';
import { listTokenActivity, parseActivityCursor } from '@/modules/api-tokens';
import { requireUserOrRedirect } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Журнал токена — Tasker' };

type Props = PageProps<'/profile/tokens/[tokenId]'>;

export default function TokenActivityPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
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
        <h2 id="token-activity-heading" className="text-lg font-semibold break-words">
          Журнал токена «{result.token.name}»
        </h2>
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
