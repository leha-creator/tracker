'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from 'react';

import type { TaskListQuery, TaskListScope } from '@/modules/tasks/client';

import { taskListHref } from './task-list-href';

interface TaskListContextValue {
  /** Запрос с учётом ещё не завершённой навигации — чтобы выбор отмечался сразу. */
  query: TaskListQuery;
  scope: TaskListScope;
  basePath: string;
  /** Переход к новому запросу; `replace` — без новой записи в истории (ввод в поиск). */
  navigate: (next: TaskListQuery, options?: { replace?: boolean }) => void;
}

const TaskListContext = createContext<TaskListContextValue | null>(null);

export function useTaskList(): TaskListContextValue {
  const context = useContext(TaskListContext);
  if (!context) throw new Error('useTaskList must be used inside <TaskListShell>');
  return context;
}

interface TaskListShellProps {
  query: TaskListQuery;
  scope: TaskListScope;
  basePath: string;
  children: ReactNode;
}

/**
 * Состояние списка живёт в URL: фильтры и сортировка меняют адрес, страница перерисовывается
 * на сервере. Пока идёт переход, корень помечен `data-pending` — таблица приглушается
 * (`group-data-pending/list:`), а не заменяется скелетоном.
 */
export function TaskListShell({ query, scope, basePath, children }: TaskListShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(query);

  function navigate(next: TaskListQuery, options?: { replace?: boolean }) {
    const href = taskListHref(basePath, next, scope);
    startTransition(() => {
      setOptimisticQuery(next);
      if (options?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  return (
    <TaskListContext value={{ query: optimisticQuery, scope, basePath, navigate }}>
      <div
        className="group/list grid gap-3"
        data-pending={isPending ? '' : undefined}
        aria-busy={isPending || undefined}
      >
        {children}
      </div>
    </TaskListContext>
  );
}
