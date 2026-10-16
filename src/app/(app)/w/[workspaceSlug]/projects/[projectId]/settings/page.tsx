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
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <SettingsSection params={params} />
    </Suspense>
  );
}

async function SettingsSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, projectId } = await params;
  const { session, workspace, project, access } = await loadProjectPage(workspaceSlug, projectId);
  // Без права управления проектами — 404; сервер всё равно проверяет право в каждом action.
  if (!access.permissions.manageProjects) notFound();
  const statuses = await listStatuses(session, workspace.id, project.id);

  return (
    <div className="grid w-full max-w-3xl gap-6">
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
            Колонки доски слева направо. Категория определяет, считается ли задача в статусе
            выполненной.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusList workspaceId={workspace.id} projectId={project.id} statuses={statuses} />
        </CardContent>
      </Card>
      <Card className="border-destructive/40">
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
