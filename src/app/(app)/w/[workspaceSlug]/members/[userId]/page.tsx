import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { AuditEventList } from '@/components/audit/audit-event-list';
import { PageHeader, SectionHeading } from '@/components/layout/page-header';
import { DueDate } from '@/components/tasks/due-date';
import { PriorityBadge } from '@/components/tasks/priority-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/users/user-avatar';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';
import { listMemberWorkspaceActivity, parseAuditCursor } from '@/modules/audit';
import { getProfileCards } from '@/modules/profiles';
import { getMemberTaskSummary, MEMBER_DONE_RECENT_DAYS } from '@/modules/tasks';
import { getMember } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Профиль участника — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/members/[userId]'>;

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'long' });
const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

export default function MemberProfilePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <MemberProfile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Ошибку «не найдено» сервиса превращаем в 404 страницы. */
function orNotFound<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
}

async function MemberProfile({ params, searchParams }: Props) {
  const { workspaceSlug, userId } = await params;
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const member = await orNotFound(getMember(session, workspace.id, userId));
  const [cards, summary] = await Promise.all([
    getProfileCards([userId]),
    orNotFound(getMemberTaskSummary(session, workspace.id, userId)),
  ]);
  const card = cards.get(userId);
  const image = card?.image ?? null;
  const tasksHref = `/w/${workspace.slug}/tasks`;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Link
        href={`/w/${workspace.slug}/settings/members`}
        className="w-fit text-sm text-muted-foreground hover:text-foreground"
      >
        ← Участники
      </Link>

      <PageHeader
        as="header"
        title={member.name}
        titleAddon={
          member.isCurrentUser && (
            <span className="text-base font-normal text-muted-foreground">(вы)</span>
          )
        }
        leading={<UserAvatar user={{ name: member.name, image }} size="xl" />}
        description={card?.position && <p className="text-base">{card.position}</p>}
        meta={
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {member.isAgent ? (
              <Badge variant="secondary">Агент</Badge>
            ) : (
              <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                {WORKSPACE_ROLE_LABELS[member.role]}
              </Badge>
            )}
            {member.role !== 'owner' && member.canManageProjects && (
              <Badge variant="outline">Управляет проектами</Badge>
            )}
            {member.role !== 'owner' && member.canManageDocuments && (
              <Badge variant="outline">Управляет документами</Badge>
            )}
          </div>
        }
        actions={
          member.isCurrentUser && (
            <Button asChild variant="outline">
              <Link href="/profile">Редактировать профиль</Link>
            </Button>
          )
        }
      />

      {card?.bio && (
        <section aria-labelledby="member-bio-heading" className="grid gap-1.5">
          <SectionHeading id="member-bio-heading" size="group" title="О себе" />
          <p className="text-sm break-words whitespace-pre-wrap">{card.bio}</p>
        </section>
      )}

      <section aria-label="Задачи" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Открытых задач" value={summary.openCount} />
        <Stat
          label="Просрочено"
          value={summary.overdueCount}
          tone={summary.overdueCount > 0 ? 'danger' : undefined}
        />
        <Stat
          label={`Выполнено за ${MEMBER_DONE_RECENT_DAYS} дней`}
          value={summary.doneRecentlyCount}
        />
        <Stat label="Комментариев" value={summary.commentsCount} />
      </section>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Открытые задачи</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Открытых задач нет.</p>
            ) : (
              <ul className="grid gap-1">
                {summary.openTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`${tasksHref}/${task.number}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
                    >
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {task.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                      <PriorityBadge priority={task.priority} compact />
                      {task.dueDate && <DueDate value={task.dueDate} isOverdue={task.isOverdue} />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {summary.openCount > summary.openTasks.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Показаны {summary.openTasks.length} из {summary.openCount}.{' '}
                <Link href={tasksHref} className="text-primary hover:underline">
                  Все задачи
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Сведения</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              {member.isAgent ? (
                <Detail label="Ответственный">
                  {member.responsible ? (
                    <Link
                      href={`/w/${workspace.slug}/members/${member.responsible.userId}`}
                      className="hover:underline"
                    >
                      {member.responsible.name}
                    </Link>
                  ) : (
                    'не назначен'
                  )}
                </Detail>
              ) : (
                <Detail label="Email">
                  <a href={`mailto:${member.email}`} className="break-all hover:underline">
                    {member.email}
                  </a>
                </Detail>
              )}
              <Detail label="В пространстве с">{DATE.format(member.joinedAt)}</Detail>
              {!member.isAgent && (
                <Detail label="Зарегистрирован">{DATE.format(member.registeredAt)}</Detail>
              )}
              <Detail label="Создал задач">{summary.createdCount}</Detail>
              <Detail label="Последняя активность">
                {summary.lastActivityAt ? DATE_TIME.format(summary.lastActivityAt) : 'нет'}
              </Detail>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="member-activity-heading" className="grid gap-3">
        <SectionHeading id="member-activity-heading" size="group" title="Последние действия" />
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <MemberActivity
            session={session}
            workspace={workspace}
            userId={userId}
            searchParams={searchParams}
          />
        </Suspense>
      </section>
    </div>
  );
}

/** Действия участника в этом пространстве: задачи, документы, проекты, участники. */
async function MemberActivity({
  session,
  workspace,
  userId,
  searchParams,
}: {
  session: AuthSession;
  workspace: { id: string; slug: string };
  userId: string;
  searchParams: Props['searchParams'];
}) {
  const { activity } = await searchParams;
  const page = await listMemberWorkspaceActivity(
    session,
    workspace.id,
    userId,
    parseAuditCursor(activity),
  );
  const base = `/w/${workspace.slug}/members/${userId}`;
  return (
    <AuditEventList
      page={page}
      nextHref={(cursor) => `${base}?activity=${encodeURIComponent(cursor)}`}
      emptyText="Действий в этом пространстве пока нет."
    />
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="grid gap-1 rounded-xl border p-4">
      <span
        className={
          tone === 'danger'
            ? 'text-2xl font-semibold text-destructive tabular-nums'
            : 'text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
