import { Suspense } from 'react';

import { ProjectArchivedBanner } from '@/components/projects/project-archived-banner';
import { ProjectNav } from '@/components/projects/project-nav';
import { Skeleton } from '@/components/ui/skeleton';

import { loadProjectPage } from './_lib/load-project';

type Props = LayoutProps<'/w/[workspaceSlug]/projects/[projectId]'>;

export default function ProjectLayout({ children, params }: Props) {
  return (
    <div data-project-shell className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {/* Шапка читает проект за границей Suspense: {children} не ждёт её. Страницы проверяют доступ сами. */}
      <Suspense fallback={<Skeleton className="h-32 rounded-lg" />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function ProjectHeader({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, projectId } = await params;
  const { workspace, project, access } = await loadProjectPage(workspaceSlug, projectId);
  const basePath = `/w/${workspace.slug}/projects/${project.id}`;
  return (
    // Одна строка сетки оболочки: доска растягивается на вторую (globals.css, data-project-shell).
    <div className="grid gap-4">
      <ProjectNav
        basePath={basePath}
        projectsHref={`/w/${workspace.slug}`}
        name={project.name}
        icon={project.icon}
        description={project.description}
        canManage={access.permissions.manageProjects}
        archived={project.archivedAt !== null}
      />
      {project.archivedAt && (
        <ProjectArchivedBanner
          archivedAt={project.archivedAt}
          archivedByName={project.archivedByName}
          settingsHref={access.permissions.manageProjects ? `${basePath}/settings` : undefined}
        />
      )}
    </div>
  );
}
