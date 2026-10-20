import { Suspense } from 'react';

import { adminActivityHref } from '@/components/admin/activity/admin-activity-href';
import { AdminActivityToolbar } from '@/components/admin/activity/admin-activity-toolbar';
import { AuditEventList } from '@/components/audit/audit-event-list';
import { Skeleton } from '@/components/ui/skeleton';
import {
  hasActiveAuditFilters,
  listAdminAuditEvents,
  parseAdminAuditParams,
} from '@/modules/audit';
import { getProfileCards } from '@/modules/profiles';
import { requireAdminOrNotFound } from '@/shared/access';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

type Props = PageProps<'/admin/activity'>;

export default function AdminActivityPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ActivitySection searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivitySection({ searchParams }: Pick<Props, 'searchParams'>) {
  await requireAdminOrNotFound('/admin/activity');
  const query = parseAdminAuditParams(await searchParams);
  const [page, cards] = await Promise.all([
    listAdminAuditEvents(query),
    query.userId ? getProfileCards([query.userId]) : Promise.resolve(null),
  ]);
  const userName = query.userId ? (cards?.get(query.userId)?.name ?? null) : null;
  // Название пространства — из его событий (снимок в журнале); без событий — «выбрано».
  const workspaceName = query.workspaceId
    ? (page.items.find((event) => event.workspace?.id === query.workspaceId)?.workspace?.name ??
      null)
    : null;

  return (
    <div className="grid gap-4">
      <AdminActivityToolbar query={query} userName={userName} workspaceName={workspaceName} />
      <AuditEventList
        page={page}
        nextHref={(cursor) => adminActivityHref(query, cursor)}
        showActor
        showWorkspace
        emptyText={
          hasActiveAuditFilters(query) ? 'Событий по этим фильтрам нет.' : 'Событий пока нет.'
        }
      />
    </div>
  );
}
