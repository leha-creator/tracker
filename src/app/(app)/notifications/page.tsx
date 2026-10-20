import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { TabLink } from '@/components/layout/tab-link';
import { NotificationFeed } from '@/components/notifications/notification-feed';
import { Skeleton } from '@/components/ui/skeleton';
import { listMyNotifications } from '@/modules/notifications';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Уведомления — Tasker' };

type Props = PageProps<'/notifications'>;

export default function NotificationsPage({ searchParams }: Props) {
  return (
    <PageContainer as="main" id="main-content" size="narrow" className="grid gap-6 py-6">
      <PageHeader title="Уведомления" />
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <NotificationsSection searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function NotificationsSection({ searchParams }: Pick<Props, 'searchParams'>) {
  const raw = await searchParams;
  const unreadOnly = raw.filter === 'unread';
  const session = await requireUserOrRedirect(
    unreadOnly ? '/notifications?filter=unread' : '/notifications',
  );
  const page = await listMyNotifications(session, { unreadOnly });

  return (
    <div className="grid gap-4">
      <nav aria-label="Фильтр уведомлений" className="flex gap-5 border-b">
        <TabLink href="/notifications" active={!unreadOnly} className="h-9">
          Все
        </TabLink>
        <TabLink href="/notifications?filter=unread" active={unreadOnly} className="h-9">
          Непрочитанные
        </TabLink>
      </nav>
      {/* key: другой фильтр — новая лента со своим курсором. */}
      <NotificationFeed key={String(unreadOnly)} initial={page} unreadOnly={unreadOnly} />
    </div>
  );
}
