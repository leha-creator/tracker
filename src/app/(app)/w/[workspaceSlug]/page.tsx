import Link from 'next/link';
import { Suspense } from 'react';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import {
  CREATE_PANEL_PARAM,
  isCreatePanelOpen,
  newProjectHref,
} from '@/components/layout/create-panel-href';
import { SidePanel } from '@/components/layout/side-panel';
import { CreateProjectForm } from '@/components/projects/create-project-form';
import { ProjectList } from '@/components/projects/project-list';
import { Button } from '@/components/ui/button';
import { listProjects } from '@/modules/projects';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export default function WorkspacePage({ params, searchParams }: PageProps<'/w/[workspaceSlug]'>) {
  return (
    <Suspense fallback={<div className="h-28 animate-pulse rounded-xl bg-muted" />}>
      <ProjectsSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectsSection({
  params,
  searchParams,
}: Pick<PageProps<'/w/[workspaceSlug]'>, 'params' | 'searchParams'>) {
  const { workspaceSlug } = await params;
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const projects = await listProjects(session, workspace.id);
  const canManage = access.permissions.manageProjects;
  // Без права управления проектами панели нет; сервер всё равно проверит право.
  const createOpen =
    canManage && isCreatePanelOpen((await searchParams)[CREATE_PANEL_PARAM], 'project');

  return (
    <section className="grid gap-8" aria-labelledby="projects-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Плитка 48px = строка названия 28px + строка «Проекты» 20px. */}
          <EntityIconTile icon={workspace.icon} size="xl" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-7 font-semibold tracking-tight">
              {workspace.name}
            </h1>
            <h2 id="projects-heading" className="text-sm leading-5 text-muted-foreground">
              Проекты
            </h2>
          </div>
        </div>
        {canManage && projects.length > 0 && (
          <Button asChild size="sm">
            <Link href={newProjectHref(workspace.slug)} scroll={false}>
              Создать проект
            </Link>
          </Button>
        )}
      </div>
      <ProjectList workspaceSlug={workspace.slug} items={projects} canManage={canManage} />
      {createOpen && (
        <SidePanel
          closeHref={`/w/${workspace.slug}`}
          title="Новый проект"
          description="Колонки «К выполнению», «В работе» и «Готово» создадутся сразу — их можно изменить в настройках проекта."
        >
          <CreateProjectForm workspaceId={workspace.id} />
        </SidePanel>
      )}
    </section>
  );
}
