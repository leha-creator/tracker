import { ListChecksIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import {
  CREATE_PANEL_PARAM,
  isCreatePanelOpen,
  NEW_WORKSPACE_HREF,
} from '@/components/layout/create-panel-href';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { SidePanel } from '@/components/layout/side-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArchivedWorkspaces } from '@/components/workspaces/archived-workspaces';
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form';
import { WorkspaceList } from '@/components/workspaces/workspace-list';
import { listMyWorkspaces } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';

export default function HomePage({ searchParams }: PageProps<'/'>) {
  return (
    <PageContainer as="main" id="main-content" size="wide" className="grid gap-6 py-6">
      <PageHeader
        title="Мои пространства"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/my-tasks">
                <ListChecksIcon />
                Мои задачи
              </Link>
            </Button>
            <Button asChild>
              <Link href={NEW_WORKSPACE_HREF} scroll={false}>
                Создать пространство
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-24 rounded-xl" />}>
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
  // Архивные — только пространства, где пользователь владелец; пустой раздел не показывается.
  const [workspaces, archived] = await Promise.all([
    listMyWorkspaces(session),
    listMyWorkspaces(session, { archived: true }),
  ]);
  return (
    <>
      <WorkspaceList items={workspaces} />
      {archived.length > 0 && <ArchivedWorkspaces items={archived} />}
    </>
  );
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
