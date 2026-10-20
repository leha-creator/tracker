import { Archive, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import {
  CREATE_PANEL_PARAM,
  isCreatePanelOpen,
  newProjectHref,
} from '@/components/layout/create-panel-href';
import { PageHeader } from '@/components/layout/page-header';
import { SidePanel } from '@/components/layout/side-panel';
import { CreateProjectForm } from '@/components/projects/create-project-form';
import { ProjectList } from '@/components/projects/project-list';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listProjects } from '@/modules/projects';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

export default function WorkspacePage({ params, searchParams }: PageProps<'/w/[workspaceSlug]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-28 rounded-xl" />}>
      <ProjectsSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectsSection({
  params,
  searchParams,
}: Pick<PageProps<'/w/[workspaceSlug]'>, 'params' | 'searchParams'>) {
  const { workspaceSlug } = await params;
  // Владельца архивного пространства — на главную, к восстановлению; остальным — 404.
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(
    workspaceSlug,
    'member',
    { allowArchived: true },
  );
  if (workspace.archivedAt) redirect('/#archived-workspaces');
  const projects = await listProjects(session, workspace.id);
  const canManage = access.permissions.manageProjects;
  // Без права управления проектами панели нет; сервер всё равно проверит право.
  const createOpen =
    canManage && isCreatePanelOpen((await searchParams)[CREATE_PANEL_PARAM], 'project');

  return (
    <section className="grid gap-8" aria-labelledby="projects-heading">
      <PageHeader
        title={workspace.name}
        overflow="truncate"
        leading={<EntityIconTile icon={workspace.icon} size="xl" />}
        description={<h2 id="projects-heading">Проекты</h2>}
        actions={
          canManage &&
          projects.length > 0 && (
            <Button asChild size="sm">
              <Link href={newProjectHref(workspace.slug)} scroll={false}>
                Создать проект
              </Link>
            </Button>
          )
        }
      />
      <ProjectList workspaceSlug={workspace.slug} items={projects} canManage={canManage} />
      <Suspense fallback={null}>
        <ArchivedProjects session={session} workspace={workspace} />
      </Suspense>
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

/** Свёрнутый блок архивных проектов: доска открывается только для чтения. Пусто — не показывается. */
async function ArchivedProjects({
  session,
  workspace,
}: {
  session: AuthSession;
  workspace: { id: string; slug: string };
}) {
  const projects = await listProjects(session, workspace.id, { archived: true });
  if (projects.length === 0) return null;
  return (
    <details className="group rounded-xl border">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium select-none hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <Archive aria-hidden className="size-4 text-muted-foreground" />
        Архивные проекты
        <span className="text-muted-foreground tabular-nums">{projects.length}</span>
      </summary>
      <ul className="grid border-t">
        {projects.map((project) => (
          <li key={project.id} className="border-b last:border-b-0">
            <Link
              href={`/w/${workspace.slug}/projects/${project.id}/board`}
              className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
            >
              <EntityIconTile icon={project.icon} size="sm" />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.archivedAt && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  в архиве с {DATE.format(project.archivedAt)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
