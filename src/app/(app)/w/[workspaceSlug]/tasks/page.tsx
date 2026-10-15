import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { TaskTable } from '@/components/tasks/task-table';
import { Button } from '@/components/ui/button';
import { listTasks } from '@/modules/tasks';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Задачи — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks'>;

export default function TasksPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <TasksSection params={params} />
    </Suspense>
  );
}

async function TasksSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const page = await listTasks(session, workspace.id);

  return (
    <section className="grid gap-4" aria-labelledby="tasks-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          Задачи
        </h2>
        <Button asChild size="sm">
          <Link href={`/w/${workspace.slug}/tasks/new`}>Новая задача</Link>
        </Button>
      </div>
      {page.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Задач пока нет. Создайте первую — или добавьте её прямо в колонке доски проекта.
        </p>
      ) : (
        <TaskTable
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          items={page.items}
          nextCursor={page.nextCursor}
        />
      )}
    </section>
  );
}
