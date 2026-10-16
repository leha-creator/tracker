import type { Metadata } from 'next';
import { Suspense } from 'react';

import { TaskPanelSkeleton } from '@/components/tasks/task-panel/task-panel-frame';
import { TaskCreateView } from '@/components/tasks/task-panel/task-create-view';
import { parseTaskParentParam } from '@/components/tasks/task-panel/task-panel-href';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Новая задача — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks/new'>;

/** Отдельная страница создания: та же компоновка, что в панели; после создания — на страницу задачи. */
export default function NewTaskPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl overflow-clip rounded-xl border bg-background">
      <Suspense fallback={<TaskPanelSkeleton />}>
        <NewTaskSection params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewTaskSection({ params, searchParams }: Props) {
  const { workspaceSlug } = await params;
  const { projectId, parent } = await searchParams;
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);

  return (
    <TaskCreateView
      session={session}
      workspaceId={workspace.id}
      variant="page"
      closeHref={`/w/${workspace.slug}/tasks`}
      defaultProjectId={typeof projectId === 'string' ? projectId : undefined}
      parentNumber={parseTaskParentParam(parent)}
    />
  );
}
