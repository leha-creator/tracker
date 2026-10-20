import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LiveRefresh } from '@/components/realtime/use-live-refresh';
import { TaskPanel } from '@/components/tasks/task-panel/task-panel';
import { taskPanelHref } from '@/components/tasks/task-panel/task-panel-href';
import { TaskListEmpty } from '@/components/tasks/task-list/task-list-empty';
import { TaskListPagination } from '@/components/tasks/task-list/task-list-pagination';
import { TaskListShell } from '@/components/tasks/task-list/task-list-shell';
import { TaskListTable } from '@/components/tasks/task-list/task-list-table';
import { TaskListToolbar } from '@/components/tasks/task-list/task-list-toolbar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getPullRequestBadges } from '@/modules/integrations/github';
import { listStatuses } from '@/modules/projects';
import {
  hasActiveFilters,
  listLabels,
  listSavedViews,
  listProjectTasks,
  parseTaskListParams,
} from '@/modules/tasks';
import { listMembers } from '@/modules/workspaces';

import { loadProjectPage } from '../_lib/load-project';

export const metadata: Metadata = { title: 'Список проекта — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/projects/[projectId]/list'>;

export default function ProjectListPage({ params, searchParams }: Props) {
  return (
    <>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <ListSection params={params} searchParams={searchParams} />
      </Suspense>
      {/* Панель задачи (`?task=`) — своя граница Suspense, список её не ждёт. */}
      <Suspense fallback={null}>
        <ListTaskPanel params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ListTaskPanel({ params, searchParams }: Props) {
  const { workspaceSlug, projectId } = await params;
  return (
    <TaskPanel
      workspaceSlug={workspaceSlug}
      searchParams={searchParams}
      basePath={`/w/${workspaceSlug}/projects/${projectId}/list`}
      defaultProjectId={projectId}
    />
  );
}

async function ListSection({ params, searchParams }: Props) {
  const [{ workspaceSlug, projectId }, raw] = await Promise.all([params, searchParams]);
  const { session, workspace, project } = await loadProjectPage(workspaceSlug, projectId);
  const query = parseTaskListParams(raw, 'project');
  const projectPath = `/w/${workspace.slug}/projects/${project.id}`;
  const basePath = `${projectPath}/list`;
  // Статусы — из модуля projects, участники — из workspaces, строки — из tasks.
  const [page, statuses, members, labels, savedViews] = await Promise.all([
    listProjectTasks(session, workspace.id, project.id, query),
    listStatuses(session, workspace.id, project.id),
    listMembers(session, workspace.id),
    listLabels(session, workspace.id),
    listSavedViews(session, { scope: 'project', workspaceId: workspace.id, projectId: project.id }),
  ]);
  const shown = { ...query, page: page.page };
  const pullRequests = await getPullRequestBadges(
    session,
    workspace.id,
    page.items.map((task) => task.id),
  );

  return (
    <TaskListShell query={shown} scope="project" basePath={basePath}>
      <LiveRefresh projectId={project.id} tasksOnly debounceMs={1000} />
      <TaskListToolbar
        options={{
          currentUserId: session.user.id,
          members: members.map(({ userId, name }) => ({ userId, name })),
          statuses: statuses.map(({ id, name, color }) => ({ id, name, color })),
          labels: labels.map(({ id, name, color }) => ({ id, name, color })),
          savedViews: { views: savedViews, workspaceId: workspace.id, projectId: project.id },
          csvExport: { path: `/api/w/${workspace.slug}/tasks/export`, projectId: project.id },
        }}
      />
      {page.total === 0 ? (
        <TaskListEmpty
          filtered={hasActiveFilters(query)}
          query={shown}
          scope="project"
          basePath={basePath}
          title="В проекте пока нет задач."
          action={
            <>
              <Button asChild size="sm">
                <Link href={taskPanelHref(basePath, raw, 'new')} scroll={false}>
                  Новая задача
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`${projectPath}/board`}>Открыть доску</Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <TaskListTable
            items={page.items}
            scope="project"
            basePath={basePath}
            searchParams={raw}
            pullRequests={pullRequests}
            projectId={project.id}
          />
          <TaskListPagination page={page} query={shown} scope="project" basePath={basePath} />
        </>
      )}
    </TaskListShell>
  );
}
