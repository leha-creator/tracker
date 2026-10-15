import Link from 'next/link';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { WorkspaceList } from '@/components/workspaces/workspace-list';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

export default function HomePage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Мои пространства</h1>
        <Button asChild>
          <Link href="/workspaces/new">Создать пространство</Link>
        </Button>
      </div>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
        <WorkspacesSection />
      </Suspense>
    </main>
  );
}

async function WorkspacesSection() {
  const session = await requireUserOrRedirect('/');
  const workspaces = await listMyWorkspaces(session);
  return <WorkspaceList items={workspaces} />;
}
