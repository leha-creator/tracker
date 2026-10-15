import Link from 'next/link';
import { Suspense } from 'react';

import { ProjectList } from '@/components/projects/project-list';
import { Button } from '@/components/ui/button';
import { listProjects } from '@/modules/projects';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export default function WorkspacePage({ params }: PageProps<'/w/[workspaceSlug]'>) {
  return (
    <Suspense fallback={<div className="h-28 animate-pulse rounded-xl bg-muted" />}>
      <ProjectsSection params={params} />
    </Suspense>
  );
}

async function ProjectsSection({ params }: Pick<PageProps<'/w/[workspaceSlug]'>, 'params'>) {
  const { workspaceSlug } = await params;
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const projects = await listProjects(session, workspace.id);
  const canManage = access.permissions.manageProjects;

  return (
    <section className="grid gap-4" aria-labelledby="projects-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-heading" className="text-lg font-semibold">
          Проекты
        </h2>
        {canManage && projects.length > 0 && (
          <Button asChild size="sm">
            <Link href={`/w/${workspace.slug}/projects/new`}>Создать проект</Link>
          </Button>
        )}
      </div>
      <ProjectList workspaceSlug={workspace.slug} items={projects} canManage={canManage} />
    </section>
  );
}
