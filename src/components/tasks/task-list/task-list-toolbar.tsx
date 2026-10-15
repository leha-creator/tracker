'use client';

import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { StatusDot } from '@/components/projects/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { STATUS_CATEGORIES, STATUS_CATEGORY_LABELS } from '@/modules/projects/client';
import {
  clearFilters,
  hasActiveFilters,
  patchTaskListQuery,
  TASK_DUE_FILTER_LABELS,
  TASK_DUE_FILTERS,
  TASK_LIST_ME,
  TASK_LIST_NONE,
  TASK_LIST_QUERY_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskCategoryFilter,
  type TaskDueFilter,
  type TaskPriority,
} from '@/modules/tasks/client';

import { TaskListFilter, type FilterOption } from './task-list-filter';
import { useTaskList } from './task-list-shell';
import type { TaskListOptions } from './task-list-types';

const SEARCH_DELAY_MS = 300;
const ANY_DUE = 'any';

/** Поиск и фильтры списка. Значения берутся из URL (через `TaskListShell`), изменения — навигацией. */
export function TaskListToolbar({ options }: { options: TaskListOptions }) {
  const { query, scope, navigate } = useTaskList();

  const projectOptions: FilterOption[] = [
    { value: TASK_LIST_NONE, label: 'Вне проектов', separatorAfter: true },
    ...(options.projects ?? []).map((project) => ({ value: project.id, label: project.name })),
  ];
  const categoryOptions: FilterOption[] = [
    ...STATUS_CATEGORIES.map((category) => ({
      value: category,
      label: STATUS_CATEGORY_LABELS[category],
    })),
    { value: TASK_LIST_NONE, label: 'Вне проектов' },
  ];
  const statusOptions: FilterOption[] = (options.statuses ?? []).map((status) => ({
    value: status.id,
    label: status.name,
    icon: <StatusDot color={status.color} />,
  }));
  const priorityOptions: FilterOption[] = [...TASK_PRIORITIES].reverse().map((priority) => ({
    value: priority,
    label: TASK_PRIORITY_LABELS[priority],
  }));
  const assigneeOptions: FilterOption[] = [
    { value: TASK_LIST_ME, label: 'Я' },
    { value: TASK_LIST_NONE, label: 'Не назначен', separatorAfter: true },
    ...options.members
      .filter((member) => member.userId !== options.currentUserId)
      .map((member) => ({ value: member.userId, label: member.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Фильтры задач">
      <TaskSearch />
      {scope === 'workspace' ? (
        <>
          <TaskListFilter
            label="Проект"
            options={projectOptions}
            selected={query.projects}
            onChange={(projects) => navigate(patchTaskListQuery(query, { projects }))}
          />
          <TaskListFilter
            label="Статус"
            options={categoryOptions}
            selected={query.categories}
            onChange={(categories) =>
              navigate(
                patchTaskListQuery(query, { categories: categories as TaskCategoryFilter[] }),
              )
            }
          />
        </>
      ) : (
        <TaskListFilter
          label="Статус"
          options={statusOptions}
          selected={query.statuses}
          onChange={(statuses) => navigate(patchTaskListQuery(query, { statuses }))}
        />
      )}
      <TaskListFilter
        label="Приоритет"
        options={priorityOptions}
        selected={query.priorities}
        onChange={(priorities) =>
          navigate(patchTaskListQuery(query, { priorities: priorities as TaskPriority[] }))
        }
      />
      <TaskListFilter
        label="Ответственный"
        options={assigneeOptions}
        selected={query.assignees}
        onChange={(assignees) => navigate(patchTaskListQuery(query, { assignees }))}
      />
      <DueFilter />
      {hasActiveFilters(query) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(clearFilters(query, scope))}
        >
          <XIcon />
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
}

function DueFilter() {
  const { query, navigate } = useTaskList();
  const label = query.due ? `Срок: ${TASK_DUE_FILTER_LABELS[query.due]}` : 'Срок';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(query.due && 'border-primary/50 bg-primary/5')}
        >
          {label}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuLabel>Срок</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={query.due ?? ANY_DUE}
          onValueChange={(value) =>
            navigate(
              patchTaskListQuery(query, {
                due: value === ANY_DUE ? null : (value as TaskDueFilter),
              }),
            )
          }
        >
          <DropdownMenuRadioItem value={ANY_DUE}>Любой</DropdownMenuRadioItem>
          {TASK_DUE_FILTERS.map((filter) => (
            <DropdownMenuRadioItem key={filter} value={filter}>
              {TASK_DUE_FILTER_LABELS[filter]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Поиск с задержкой. Черновик синхронизируется с `query.q`, когда тот меняется извне
 * («Сбросить фильтры», «назад»): Activity сохраняет состояние страницы между переходами.
 */
function TaskSearch() {
  const { query, navigate } = useTaskList();
  const [draft, setDraft] = useState(query.q);
  const [syncedQ, setSyncedQ] = useState(query.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Отложенный поиск применяется к актуальному запросу, а не к тому, что был при вводе.
  const latestQuery = useRef(query);
  useEffect(() => {
    latestQuery.current = query;
  });

  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    setDraft(query.q);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function submit(value: string) {
    clearTimeout(timer.current);
    const current = latestQuery.current;
    const q = value.trim().replace(/\s+/g, ' ');
    if (q === current.q) return;
    navigate(patchTaskListQuery(current, { q }), { replace: true });
  }

  function change(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => submit(value), SEARCH_DELAY_MS);
  }

  return (
    <div className="relative w-full sm:w-64">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={draft}
        maxLength={TASK_LIST_QUERY_MAX_LENGTH}
        placeholder="Название или #номер"
        aria-label="Поиск задач"
        className="h-8 pl-8"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit(draft);
          if (event.key === 'Escape' && draft) {
            event.preventDefault();
            setDraft('');
            submit('');
          }
        }}
      />
    </div>
  );
}
