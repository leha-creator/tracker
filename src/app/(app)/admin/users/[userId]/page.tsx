import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { UserDetailHeader } from '@/components/admin/users/detail/user-detail-header';
import { UserMemberships } from '@/components/admin/users/detail/user-memberships';
import { UserSessionsList } from '@/components/admin/users/detail/user-sessions-list';
import { ApiTokensTable } from '@/components/api-tokens/api-tokens-table';
import { AuditEventList } from '@/components/audit/audit-event-list';
import { SectionHeading } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminUserDetail } from '@/modules/admin';
import { EMPTY_ADMIN_AUDIT_QUERY, listAdminAuditEvents, parseFeedCursor } from '@/modules/audit';
import { requireAdminOrNotFound } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

type Props = PageProps<'/admin/users/[userId]'>;

export default function AdminUserPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <UserCard params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function UserCard({ params, searchParams }: Props) {
  const { userId } = await params;
  await requireAdminOrNotFound(`/admin/users/${userId}`);
  const detail = await getAdminUserDetail(userId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { user } = detail;

  return (
    <div className="grid gap-8">
      <Link
        href="/admin/users"
        className="w-fit text-sm text-muted-foreground hover:text-foreground"
      >
        ← Пользователи
      </Link>
      <UserDetailHeader user={user} />

      <Section title="Пространства">
        <UserMemberships items={detail.memberships} />
      </Section>

      <Section
        title="Сеансы в Tasker"
        description="Устройства, где открыт Tasker. Завершённая сессия может оставаться активной до 5 минут — столько живёт кеш сессии в браузере. «Завершить все сессии» в меню действий завершает и сеансы plwedding ID."
      >
        <UserSessionsList
          userId={user.id}
          sessions={detail.sessions}
          canRevoke={!user.isCurrentUser}
        />
      </Section>

      <Section title="Токены доступа">
        <ApiTokensTable
          items={detail.tokens}
          target={{ kind: 'admin', userId: user.id }}
          emptyText="У пользователя нет токенов доступа."
        />
      </Section>

      <Section
        title="Журнал"
        description="События, где пользователь — автор или субъект: входы и безопасность учётной записи (из plwedding ID), действия в пространствах и действия администраторов над ним."
      >
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <UserAudit userId={user.id} searchParams={searchParams} />
        </Suspense>
      </Section>
    </div>
  );
}

async function UserAudit({
  userId,
  searchParams,
}: {
  userId: string;
  searchParams: Props['searchParams'];
}) {
  const { events } = await searchParams;
  const page = await listAdminAuditEvents({
    ...EMPTY_ADMIN_AUDIT_QUERY,
    userId,
    cursor: parseFeedCursor(events),
  });
  return (
    <div className="grid gap-3">
      <AuditEventList
        page={page}
        nextHref={(cursor) => `/admin/users/${userId}?events=${encodeURIComponent(cursor)}`}
        showActor
        showWorkspace
        emptyText="Событий пока нет."
      />
      <Link
        href={`/admin/activity?user=${encodeURIComponent(userId)}`}
        className="w-fit text-sm text-primary hover:underline"
      >
        Открыть в общем журнале с фильтрами
      </Link>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <SectionHeading size="group" title={title} />
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
