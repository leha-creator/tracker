import { Suspense } from 'react';

import { ProjectNav } from '@/components/projects/project-nav';

import { loadProjectPage } from './_lib/load-project';

type Props = LayoutProps<'/w/[workspaceSlug]/projects/[projectId]'>;

export default function ProjectLayout({ children, params }: Props) {
  return (
    <div className="grid gap-4">
      {/* Шапка читает проект за границей Suspense: {children} не ждёт её. Страницы проверяют доступ сами. */}
      <Suspense fallback={<div className="h-16 animate-pulse rounded-lg bg-muted" />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function ProjectHeader({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, projectId } = await params;
  const { workspace, project, access } = await loadProjectPage(workspaceSlug, projectId);
  return (
    <ProjectNav
      basePath={`/w/${workspace.slug}/projects/${project.id}`}
      name={project.name}
      description={project.description}
      canManage={access.permissions.manageProjects}
    />
  );
}
