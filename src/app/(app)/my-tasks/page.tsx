import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { TaskListEmpty } from '@/components/tasks/task-list/task-list-empty';
import { TaskListPagination } from '@/components/tasks/task-list/task-list-pagination';
import { TaskListShell } from '@/components/tasks/task-list/task-list-shell';
import { TaskListTable } from '@/components/tasks/task-list/task-list-table';
import { TaskListToolbar } from '@/components/tasks/task-list/task-list-toolbar';
import { Skeleton } from '@/components/ui/skeleton';
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
        <PageHeader
          id="my-tasks-heading"
          title="Мои задачи"
          description="Открытые задачи, где вы ответственный, во всех ваших пространствах."
        />
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
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
          title="На вас нет открытых задач."
        />
      ) : (
        <>
          <TaskListTable items={page.items} scope="mine" basePath={BASE_PATH} searchParams={raw} />
          <TaskListPagination page={page} query={shown} scope="mine" basePath={BASE_PATH} />
        </>
      )}
    </TaskListShell>
  );
}
