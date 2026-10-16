import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { TaskPanel } from '@/components/tasks/task-panel/task-panel';
import { taskPanelHref } from '@/components/tasks/task-panel/task-panel-href';
import { TaskListEmpty } from '@/components/tasks/task-list/task-list-empty';
import { TaskListPagination } from '@/components/tasks/task-list/task-list-pagination';
import { TaskListShell } from '@/components/tasks/task-list/task-list-shell';
import { TaskListTable } from '@/components/tasks/task-list/task-list-table';
import { TaskListToolbar } from '@/components/tasks/task-list/task-list-toolbar';
import { Button } from '@/components/ui/button';
import { listProjects } from '@/modules/projects';
import { hasActiveFilters, listTasks, parseTaskListParams } from '@/modules/tasks';
import { listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Задачи — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks'>;

export default function TasksPage({ params, searchParams }: Props) {
  return (
    <>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <TasksSection params={params} searchParams={searchParams} />
      </Suspense>
      {/* Панель задачи (`?task=`) — своя граница Suspense, список её не ждёт. */}
      <Suspense fallback={null}>
        <TasksPanel params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TasksPanel({ params, searchParams }: Props) {
  const { workspaceSlug } = await params;
  return (
    <TaskPanel
      workspaceSlug={workspaceSlug}
      searchParams={searchParams}
      basePath={`/w/${workspaceSlug}/tasks`}
    />
  );
}

async function TasksSection({ params, searchParams }: Props) {
  const [{ workspaceSlug }, raw] = await Promise.all([params, searchParams]);
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const query = parseTaskListParams(raw, 'workspace');
  const basePath = `/w/${workspace.slug}/tasks`;
  // Фильтры — из модулей workspaces и projects, строки — из tasks: модули друг о друге не знают.
  const [page, members, projects] = await Promise.all([
    listTasks(session, workspace.id, query),
    listMembers(session, workspace.id),
    listProjects(session, workspace.id),
  ]);
  // Номер страницы мог быть ограничен последней — показываем фактический.
  const shown = { ...query, page: page.page };

  return (
    <section className="grid gap-4" aria-labelledby="tasks-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="tasks-heading" className="text-2xl font-semibold tracking-tight">
          Задачи
        </h1>
        <Button asChild size="sm">
          <Link href={taskPanelHref(basePath, raw, 'new')} scroll={false}>
            Новая задача
          </Link>
        </Button>
      </div>
      <TaskListShell query={shown} scope="workspace" basePath={basePath}>
        <TaskListToolbar
          options={{
            currentUserId: session.user.id,
            members: members.map(({ userId, name }) => ({ userId, name })),
            projects: projects.map(({ id, name }) => ({ id, name })),
          }}
        />
        {page.total === 0 ? (
          <TaskListEmpty
            filtered={hasActiveFilters(query)}
            query={shown}
            scope="workspace"
            basePath={basePath}
          >
            <p>Задач пока нет. Создайте первую — или добавьте её прямо в колонке доски проекта.</p>
          </TaskListEmpty>
        ) : (
          <>
            <TaskListTable
              items={page.items}
              scope="workspace"
              basePath={basePath}
              searchParams={raw}
            />
            <TaskListPagination page={page} query={shown} scope="workspace" basePath={basePath} />
          </>
        )}
      </TaskListShell>
    </section>
  );
}
