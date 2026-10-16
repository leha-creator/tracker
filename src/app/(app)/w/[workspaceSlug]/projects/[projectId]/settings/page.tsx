import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { DeleteProjectDialog } from '@/components/projects/delete-project-dialog';
import { ProjectSettingsForm } from '@/components/projects/project-settings-form';
import { StatusList } from '@/components/projects/status-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listStatuses } from '@/modules/projects';

import { loadProjectPage } from '../_lib/load-project';

export const metadata: Metadata = { title: 'Настройки проекта — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/projects/[projectId]/settings'>;

export default function ProjectSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsSection params={params} />
    </Suspense>
  );
}

/** Три карточки: основное, статусы, опасная зона. */
function SettingsSkeleton() {
  return (
    <div aria-hidden className="grid w-full max-w-4xl gap-6">
      {[2, 4, 1].map((rows, card) => (
        <div key={card} className="grid gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

async function SettingsSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, projectId } = await params;
  const { session, workspace, project, access } = await loadProjectPage(workspaceSlug, projectId);
  // Без права управления проектами — 404; сервер всё равно проверяет право в каждом action.
  if (!access.permissions.manageProjects) notFound();
  const statuses = await listStatuses(session, workspace.id, project.id);

  return (
    <div className="grid w-full max-w-4xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Основное</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectSettingsForm project={project} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Статусы</CardTitle>
          <CardDescription>
            Колонки доски слева направо — перетащите статус за ручку, чтобы изменить порядок.
            Категория определяет, считается ли задача в статусе выполненной.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusList workspaceId={workspace.id} projectId={project.id} statuses={statuses} />
        </CardContent>
      </Card>
      {/* У Card обводка — ring, а не border. */}
      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle>Опасная зона</CardTitle>
          <CardDescription>
            Удаление проекта нельзя отменить: вместе с ним удаляются его статусы.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteProjectDialog
            workspaceId={workspace.id}
            projectId={project.id}
            name={project.name}
            tasksCount={project.tasksCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
