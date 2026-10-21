import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { GithubAccountSection } from '@/components/github/github-account-section';
import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';
import { getIdpAccountUrl } from '@/modules/auth';
import { getMyProfile } from '@/modules/profiles';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Аккаунт — Tasker' };

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'long' });

export default function ProfileAccountPage({ searchParams }: PageProps<'/profile/account'>) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <AccountSections searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountSections({
  searchParams,
}: Pick<PageProps<'/profile/account'>, 'searchParams'>) {
  const { github, error } = await searchParams;
  const session = await requireUserOrRedirect('/profile/account');
  const [profile, workspaces] = await Promise.all([
    getMyProfile(session),
    listMyWorkspaces(session),
  ]);

  return (
    <SettingsSections>
      <SettingsSection
        title="Аккаунт"
        description="Вход — через plwedding ID: email и пароль меняются там."
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Имя</dt>
          <dd>{profile.name}</dd>
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
        <div>
          <Button asChild variant="outline">
            <a href={getIdpAccountUrl()} target="_blank" rel="noreferrer">
              Учётная запись plwedding ID
              <ExternalLink />
            </a>
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Пространства" description="Где вы участник и с какой ролью.">
        {workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">Вы пока не состоите в пространствах.</p>
        ) : (
          <ul className="grid divide-y divide-foreground/[0.07]">
            {workspaces.map((workspace) => (
              <li
                key={workspace.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm first:pt-0 last:pb-0"
              >
                <Link href={`/w/${workspace.slug}`} className="font-medium hover:underline">
                  {workspace.name}
                </Link>
                <Badge variant={workspace.role === 'owner' ? 'default' : 'secondary'}>
                  {WORKSPACE_ROLE_LABELS[workspace.role]}
                </Badge>
                <span className="text-muted-foreground">участников: {workspace.membersCount}</span>
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
      </SettingsSection>

      <GithubAccountSection
        session={session}
        linked={github === 'linked'}
        errorCode={typeof error === 'string' ? error : undefined}
      />
    </SettingsSections>
  );
}
