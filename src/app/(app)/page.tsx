import Link from 'next/link';
import { Suspense } from 'react';

import {
  CREATE_PANEL_PARAM,
  isCreatePanelOpen,
  NEW_WORKSPACE_HREF,
} from '@/components/layout/create-panel-href';
import { PageContainer } from '@/components/layout/page-container';
import { SidePanel } from '@/components/layout/side-panel';
import { Button } from '@/components/ui/button';
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form';
import { WorkspaceList } from '@/components/workspaces/workspace-list';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

export default function HomePage({ searchParams }: PageProps<'/'>) {
  return (
    <PageContainer as="main" id="main-content" size="wide" className="grid gap-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Мои пространства</h1>
        <Button asChild>
          <Link href={NEW_WORKSPACE_HREF} scroll={false}>
            Создать пространство
          </Link>
        </Button>
      </div>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
        <WorkspacesSection />
      </Suspense>
      <Suspense fallback={null}>
        <CreateWorkspacePanel searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function WorkspacesSection() {
  const session = await requireUserOrRedirect('/');
  const workspaces = await listMyWorkspaces(session);
  return <WorkspaceList items={workspaces} />;
}

/** Панель «Новое пространство» по `?create=workspace`; после создания action ведёт в него. */
async function CreateWorkspacePanel({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const raw = await searchParams;
  if (!isCreatePanelOpen(raw[CREATE_PANEL_PARAM], 'workspace')) return null;
  return (
    <SidePanel
      closeHref="/"
      title="Новое пространство"
      description="Вы станете владельцем и сможете пригласить в пространство участников."
    >
      <CreateWorkspaceForm />
    </SidePanel>
  );
}
