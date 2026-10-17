import { CornerDownRight } from 'lucide-react';
import Link from 'next/link';

import { PullRequestIndicator } from '@/components/github/pull-request-indicator';
import { StatusDot } from '@/components/projects/status-badge';
import { RegisterTaskOrder } from '@/components/tasks/task-navigation-context';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TASK_LIST_SORT_LABELS,
  type TaskListItemDto,
  type TaskListScope,
  type TaskPlacementDto,
} from '@/modules/tasks/client';
import type { PullRequestBadgesDto } from '@/modules/integrations/github/client';

import { UserHoverCard } from '@/components/users/user-hover-card';

import { AssigneeAvatar } from '../assignee-avatar';
import { DueDate } from '../due-date';
import { LabelChipList } from '../labels/label-chip';
import { PriorityBadge } from '../priority-badge';
import {
  parseTaskPanelParam,
  TASK_PANEL_PARAM,
  taskPanelHref,
} from '../task-panel/task-panel-href';
import { SortHeader } from './sort-header';

/** Строка «Моих задач» знает своё пространство: ссылка ведёт на страницу задачи там. */
type TaskListRow = TaskListItemDto & { workspace?: { slug: string; name: string } };

interface TaskListTableProps {
  items: TaskListRow[];
  scope: TaskListScope;
  /** Путь страницы списка и её параметры: строка открывает задачу в панели, фильтры остаются. */
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  /** Проект вкладки «Список»: колонка «Статус» показывает статус в нём. */
  projectId?: string;
  /** Индикаторы PR по id задачи (интеграция GitHub). */
  pullRequests?: PullRequestBadgesDto;
}

/** Таблица задач. Сортируемые заголовки — клиентские, строки рендерятся на сервере. */
export function TaskListTable({
  items,
  scope,
  basePath,
  searchParams,
  projectId,
  pullRequests = {},
}: TaskListTableProps) {
  const panel = parseTaskPanelParam(searchParams[TASK_PANEL_PARAM]);
  const openNumber = panel.mode === 'view' ? panel.number : null;
  const mine = scope === 'mine';
  // Задача другого пространства — его страница; в пространстве и проекте — панель списка.
  function taskHref(task: TaskListRow, number: number): string {
    return task.workspace
      ? `/w/${task.workspace.slug}/tasks/${number}`
      : taskPanelHref(basePath, searchParams, number);
  }
  return (
    <div className="overflow-x-auto rounded-lg border transition-opacity group-data-pending/list:opacity-60">
      {/* Порядок строк — для «следующая / предыдущая» (j / k) в панели задачи. */}
      {!mine && <RegisterTaskOrder numbers={items.map((task) => task.number)} />}
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader sort="number" label="№" className="w-20" />
            <SortHeader sort="title" label={TASK_LIST_SORT_LABELS.title} />
            {scope === 'project' ? (
              <SortHeader sort="status" label={TASK_LIST_SORT_LABELS.status} />
            ) : (
              <TableHead>Проекты</TableHead>
            )}
            <TableHead>Метки</TableHead>
            <SortHeader sort="priority" label={TASK_LIST_SORT_LABELS.priority} />
            <SortHeader sort="due" label={TASK_LIST_SORT_LABELS.due} />
            <TableHead>{mine ? 'Пространство' : 'Ответственный'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((task) => (
            <TableRow
              key={task.id}
              data-state={!mine && task.number === openNumber ? 'selected' : undefined}
            >
              <TableCell className="text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {task.key}
                  {pullRequests[task.id] && <PullRequestIndicator badge={pullRequests[task.id]!} />}
                </span>
              </TableCell>
              <TableCell className="max-w-80">
                {task.parent && (
                  <Link
                    href={taskHref(task, task.parent.number)}
                    scroll={false}
                    title={`Подзадача ${task.parent.key} «${task.parent.title}»`}
                    className="flex w-fit max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <CornerDownRight aria-hidden className="size-3 shrink-0" />
                    <span className="sr-only">Подзадача</span>
                    <span className="shrink-0 tabular-nums">{task.parent.key}</span>
                    <span className="truncate">{task.parent.title}</span>
                  </Link>
                )}
                <Link
                  href={taskHref(task, task.number)}
                  scroll={false}
                  aria-current={(!mine && task.number === openNumber) || undefined}
                  className="line-clamp-2 font-medium whitespace-normal hover:underline"
                >
                  {task.title}
                </Link>
              </TableCell>
              <TableCell>
                {scope === 'project' ? (
                  <ProjectStatus
                    placement={task.placements.find((item) => item.projectId === projectId)}
                  />
                ) : (
                  <Placements placements={task.placements} />
                )}
              </TableCell>
              <TableCell className="max-w-56">
                <LabelChipList labels={task.labels} />
              </TableCell>
              <TableCell>
                <PriorityBadge priority={task.priority} />
              </TableCell>
              <TableCell>
                {task.dueDate && <DueDate value={task.dueDate} isOverdue={task.isOverdue} />}
              </TableCell>
              <TableCell>
                {task.workspace ? (
                  <span className="block max-w-48 truncate text-sm">{task.workspace.name}</span>
                ) : (
                  task.assignee && (
                    <UserHoverCard
                      user={task.assignee}
                      className="flex w-fit max-w-full items-center gap-2 rounded-sm text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <AssigneeAvatar user={task.assignee} />
                      <span className="truncate">{task.assignee.name}</span>
                    </UserHoverCard>
                  )
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectStatus({ placement }: { placement: TaskPlacementDto | undefined }) {
  if (!placement) return null;
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <StatusDot color={placement.statusColor} />
      <span className="truncate">{placement.statusName}</span>
    </span>
  );
}

function Placements({ placements }: { placements: TaskPlacementDto[] }) {
  if (placements.length === 0) {
    return <span className="text-xs text-muted-foreground">Вне проектов</span>;
  }
  return (
    <ul className="grid gap-1">
      {placements.map((placement) => (
        <li key={placement.projectId} className="flex items-center gap-1.5 text-xs">
          <StatusDot color={placement.statusColor} />
          <span className="truncate">
            {placement.projectName}: {placement.statusName}
          </span>
        </li>
      ))}
    </ul>
  );
}
