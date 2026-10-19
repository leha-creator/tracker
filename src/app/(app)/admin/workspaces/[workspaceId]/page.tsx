import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { WorkspaceAdminActions } from '@/components/admin/workspaces/workspace-admin-actions';
import { AuditEventList } from '@/components/audit/audit-event-list';
import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/users/user-avatar';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';
import { getAdminWorkspaceDetail } from '@/modules/admin';
import { EMPTY_ADMIN_AUDIT_QUERY, listAdminAuditEvents, parseAuditCursor } from '@/modules/audit';
import { formatBytes } from '@/modules/documents/client';
import { requireAdminOrNotFound } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

// Без metadata.title: заголовок в статическом shell раскрыл бы раздел не-администратору.

type Props = PageProps<'/admin/workspaces/[workspaceId]'>;

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'long' });
const SHORT_DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

export default function AdminWorkspacePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <WorkspaceCard params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkspaceCard({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const session = await requireAdminOrNotFound(`/admin/workspaces/${workspaceId}`);
  const workspace = await getAdminWorkspaceDetail(workspaceId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const humans = workspace.members.filter((member) => !member.isAgent);
  const owner = workspace.owners.find((item) => item.userId !== session.user.id) ?? null;

  return (
    <div className="grid gap-8">
      <Link
        href="/admin/workspaces"
        className="w-fit text-sm text-muted-foreground hover:text-foreground"
      >
        ← Пространства
      </Link>

      <header className="grid gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <EntityIconTile icon={workspace.icon} size="xl" />
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 className="text-xl font-semibold tracking-tight break-words">{workspace.name}</h2>
            <p className="text-sm text-muted-foreground">
              /{workspace.slug}
              {workspace.taskKey ? ` · ключ ${workspace.taskKey}` : ''} · создано{' '}
              {DATE.format(workspace.createdAt)}
            </p>
            {workspace.archivedAt && (
              <Badge variant="outline" className="w-fit">
                В архиве с {SHORT_DATE.format(workspace.archivedAt)}
              </Badge>
            )}
          </div>
        </div>
        <WorkspaceAdminActions
          workspace={{
            id: workspace.id,
            name: workspace.name,
            archived: workspace.archivedAt !== null,
            storageQuotaMb: workspace.storageQuotaMb,
          }}
          candidates={humans.map((member) => ({
            userId: member.userId,
            name: member.name,
            email: member.email,
            isOwner: member.role === 'owner',
          }))}
          impersonationTarget={owner ? { userId: owner.userId, name: owner.name } : null}
        />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Участники">{workspace.membersCount}</Stat>
          <Stat label="Агенты">{workspace.agentsCount}</Stat>
          <Stat label="Проекты">{workspace.projectsCount}</Stat>
          <Stat label="Задачи">{workspace.tasksCount}</Stat>
          <Stat label="Хранилище">
            {formatBytes(workspace.storage.usedBytes)}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              / {formatBytes(workspace.storage.quotaBytes)}
              {workspace.storageQuotaMb === null ? ' (по умолчанию)' : ''}
            </span>
          </Stat>
        </dl>
      </header>

      <Section title="Участники">
        <ul className="grid divide-y rounded-xl border">
          {workspace.members.map((member) => (
            <li
              key={member.memberId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
            >
              <UserAvatar user={{ name: member.name, image: member.image }} size="sm" />
              <div className="grid min-w-0 flex-1">
                {member.isAgent ? (
                  <span className="truncate font-medium">{member.name}</span>
                ) : (
                  <Link
                    href={`/admin/users/${member.userId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {member.name}
                  </Link>
                )}
                {!member.isAgent && (
                  <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                )}
              </div>
              {member.isAgent ? (
                <Badge variant="secondary">Агент</Badge>
              ) : (
                <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                  {WORKSPACE_ROLE_LABELS[member.role]}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                с {SHORT_DATE.format(member.joinedAt)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Журнал пространства">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <WorkspaceAudit workspaceId={workspace.id} searchParams={searchParams} />
        </Suspense>
      </Section>
    </div>
  );
}

async function WorkspaceAudit({
  workspaceId,
  searchParams,
}: {
  workspaceId: string;
  searchParams: Props['searchParams'];
}) {
  const { events } = await searchParams;
  const page = await listAdminAuditEvents({
    ...EMPTY_ADMIN_AUDIT_QUERY,
    workspaceId,
    cursor: parseAuditCursor(events),
  });
  return (
    <div className="grid gap-3">
      <AuditEventList
        page={page}
        nextHref={(cursor) =>
          `/admin/workspaces/${workspaceId}?events=${encodeURIComponent(cursor)}`
        }
        showActor
        emptyText="Событий пока нет."
      />
      <Link
        href={`/admin/activity?workspace=${encodeURIComponent(workspaceId)}`}
        className="w-fit text-sm text-primary hover:underline"
      >
        Открыть в общем журнале с фильтрами
      </Link>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
