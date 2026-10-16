import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { TaskDetailsView } from '@/components/tasks/task-panel/task-details-view';
import { TaskPanelSkeleton } from '@/components/tasks/task-panel/task-panel-frame';
import { taskPageHref, withSearchParam } from '@/components/tasks/task-panel/task-panel-href';
import { taskNumberSchema } from '@/modules/tasks';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Задача — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks/[taskNumber]'>;

/** Полноэкранная задача («Развернуть» в панели, ссылка «Скопировать»): та же компоновка, что в панели. */
export default function TaskPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl overflow-clip rounded-xl border bg-background">
      <Suspense fallback={<TaskPanelSkeleton />}>
        <TaskSection params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TaskSection({ params, searchParams }: Props) {
  const [{ workspaceSlug, taskNumber }, raw] = await Promise.all([params, searchParams]);
  const parsed = taskNumberSchema.safeParse(taskNumber);
  if (!parsed.success) notFound();

  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const pageHref = taskPageHref(workspace.slug, parsed.data);

  return (
    <TaskDetailsView
      session={session}
      workspace={workspace}
      taskNumber={parsed.data}
      variant="page"
      closeHref={`/w/${workspace.slug}/tasks`}
      allComments={raw.comments === 'all'}
      showAllCommentsHref={withSearchParam(pageHref, raw, 'comments', 'all')}
      pageHref={pageHref}
    />
  );
}
