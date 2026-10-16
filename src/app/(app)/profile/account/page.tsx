import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { GithubAccountSection } from '@/components/github/github-account-section';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';
import { getMyProfile } from '@/modules/profiles';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Аккаунт — Tasker' };

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'long' });

export default function ProfileAccountPage({ searchParams }: PageProps<'/profile/account'>) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <AccountSection searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountSection({
  searchParams,
}: Pick<PageProps<'/profile/account'>, 'searchParams'>) {
  const { github, error } = await searchParams;
  const session = await requireUserOrRedirect('/profile/account');
  const [profile, workspaces] = await Promise.all([
    getMyProfile(session),
    listMyWorkspaces(session),
  ]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Аккаунт</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{profile.email}</dd>
            <dt className="text-muted-foreground">Зарегистрирован</dt>
            <dd>{DATE.format(profile.registeredAt)}</dd>
            <dt className="text-muted-foreground">Роль в системе</dt>
            <dd>
              {profile.globalRole === 'admin' ? (
                <Badge>Администратор</Badge>
              ) : (
                <Badge variant="secondary">Пользователь</Badge>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Пространства</CardTitle>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">Вы пока не состоите в пространствах.</p>
          ) : (
            <ul className="grid gap-1">
              {workspaces.map((workspace) => (
                <li
                  key={workspace.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm hover:bg-muted/50"
                >
                  <Link href={`/w/${workspace.slug}`} className="font-medium hover:underline">
                    {workspace.name}
                  </Link>
                  <Badge variant={workspace.role === 'owner' ? 'default' : 'secondary'}>
                    {WORKSPACE_ROLE_LABELS[workspace.role]}
                  </Badge>
                  <span className="text-muted-foreground">
                    участников: {workspace.membersCount}
                  </span>
                  <Link
                    href={`/w/${workspace.slug}/members/${profile.userId}`}
                    className="ml-auto text-primary hover:underline"
                  >
                    Мой профиль здесь
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <GithubAccountSection
        session={session}
        linked={github === 'linked'}
        errorCode={typeof error === 'string' ? error : undefined}
      />
    </div>
  );
}
