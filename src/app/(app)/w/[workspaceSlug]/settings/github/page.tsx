import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { GithubNotConfigured } from '@/components/github/github-not-configured';
import { GithubSettings } from '@/components/github/github-settings';
import { getGithubSettings, isGithubEnabled } from '@/modules/integrations/github';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'GitHub — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/settings/github'>;

export default function WorkspaceGithubSettingsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <GithubSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GithubSection({ params, searchParams }: Props) {
  const { workspaceSlug } = await params;
  // Только владелец; остальным — 404.
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug, 'owner');
  const header = (
    <div className="grid gap-1">
      <Link
        href={`/w/${workspace.slug}/settings`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Настройки пространства
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">GitHub</h1>
    </div>
  );

  if (!(await isGithubEnabled())) {
    return (
      <div className="grid w-full max-w-3xl gap-6">
        {header}
        <GithubNotConfigured isAdmin={session.user.role === 'admin'} />
      </div>
    );
  }

  const [settings, query] = await Promise.all([
    getGithubSettings(session, workspace.id),
    searchParams,
  ]);

  return (
    <div className="grid w-full max-w-3xl gap-6">
      {header}
      <GithubSettings
        workspace={workspace}
        settings={settings}
        connected={query.connected === '1'}
        errorCode={typeof query.error === 'string' ? query.error : undefined}
      />
    </div>
  );
}
