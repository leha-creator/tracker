import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { TaskListEmpty } from '@/components/tasks/task-list/task-list-empty';
import { TaskListPagination } from '@/components/tasks/task-list/task-list-pagination';
import { TaskListShell } from '@/components/tasks/task-list/task-list-shell';
import { TaskListTable } from '@/components/tasks/task-list/task-list-table';
import { TaskListToolbar } from '@/components/tasks/task-list/task-list-toolbar';
import {
  hasActiveFilters,
  listMyTasks,
  listSavedViews,
  parseTaskListParams,
} from '@/modules/tasks';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Мои задачи — Tasker' };

const BASE_PATH = '/my-tasks';

/**
 * Открытые задачи, где я ответственный, во всех моих пространствах. Панели задачи здесь нет:
 * строка ведёт на страницу задачи в её пространстве.
 */
export default function MyTasksPage({ searchParams }: PageProps<'/my-tasks'>) {
  return (
    <PageContainer as="main" id="main-content" size="wide" className="grid gap-6 py-6">
      <section className="grid gap-4" aria-labelledby="my-tasks-heading">
        <div className="grid gap-1">
          <h1 id="my-tasks-heading" className="text-2xl font-semibold tracking-tight">
            Мои задачи
          </h1>
          <p className="text-sm text-muted-foreground">
            Открытые задачи, где вы ответственный, во всех ваших пространствах.
          </p>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
          <MyTasksSection searchParams={searchParams} />
        </Suspense>
      </section>
    </PageContainer>
  );
}

async function MyTasksSection({ searchParams }: Pick<PageProps<'/my-tasks'>, 'searchParams'>) {
  const [session, raw] = await Promise.all([requireUserOrRedirect(BASE_PATH), searchParams]);
  const query = parseTaskListParams(raw, 'mine');
  const [page, savedViews] = await Promise.all([
    listMyTasks(session, query),
    listSavedViews(session, { scope: 'mine' }),
  ]);
  const shown = { ...query, page: page.page };

  return (
    <TaskListShell query={shown} scope="mine" basePath={BASE_PATH}>
      <TaskListToolbar
        options={{
          currentUserId: session.user.id,
          workspaces: page.workspaces.map(({ id, name }) => ({ id, name })),
          savedViews: { views: savedViews },
        }}
      />
      {page.total === 0 ? (
        <TaskListEmpty
          filtered={hasActiveFilters(query)}
          query={shown}
          scope="mine"
          basePath={BASE_PATH}
        >
          <p>На вас нет открытых задач.</p>
        </TaskListEmpty>
      ) : (
        <>
          <TaskListTable items={page.items} scope="mine" basePath={BASE_PATH} searchParams={raw} />
          <TaskListPagination page={page} query={shown} scope="mine" basePath={BASE_PATH} />
        </>
      )}
    </TaskListShell>
  );
}
