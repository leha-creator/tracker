import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CreateTaskForm } from '@/components/tasks/create-task-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listProjects, listWorkspaceStatuses } from '@/modules/projects';
import { listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Новая задача — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks/new'>;

export default function NewTaskPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 max-w-2xl animate-pulse rounded-xl bg-muted" />}>
      <NewTaskSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NewTaskSection({ params, searchParams }: Props) {
  const { workspaceSlug } = await params;
  const { projectId } = await searchParams;
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const [members, projects, statusesByProject] = await Promise.all([
    listMembers(session, workspace.id),
    listProjects(session, workspace.id),
    listWorkspaceStatuses(session, workspace.id),
  ]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Новая задача</CardTitle>
      </CardHeader>
      <CardContent>
        <CreateTaskForm
          workspaceId={workspace.id}
          members={members.map((member) => ({ userId: member.userId, name: member.name }))}
          projects={projects.map(({ id, name }) => ({ id, name }))}
          statusesByProject={statusesByProject}
          // Неизвестный проект просто не выбирается: форма проверяет его по списку статусов.
          defaultProjectId={typeof projectId === 'string' ? projectId : undefined}
        />
      </CardContent>
    </Card>
  );
}
