import Link from 'next/link';
import { Suspense } from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { WorkspaceList } from '@/components/workspaces/workspace-list';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

export default function HomePage() {
  return (
    <PageContainer as="main" id="main-content" size="wide" className="grid gap-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Мои пространства</h1>
        <Button asChild>
          <Link href="/workspaces/new">Создать пространство</Link>
        </Button>
      </div>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
        <WorkspacesSection />
      </Suspense>
    </PageContainer>
  );
}

async function WorkspacesSection() {
  const session = await requireUserOrRedirect('/');
  const workspaces = await listMyWorkspaces(session);
  return <WorkspaceList items={workspaces} />;
}
