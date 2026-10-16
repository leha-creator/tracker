import Link from 'next/link';

import { StatusDot } from '@/components/projects/status-badge';
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

import { AssigneeAvatar } from '../assignee-avatar';
import { DueDate } from '../due-date';
import { PriorityBadge } from '../priority-badge';
import {
  parseTaskPanelParam,
  TASK_PANEL_PARAM,
  taskPanelHref,
} from '../task-panel/task-panel-href';
import { SortHeader } from './sort-header';

interface TaskListTableProps {
  items: TaskListItemDto[];
  scope: TaskListScope;
  /** Путь страницы списка и её параметры: строка открывает задачу в панели, фильтры остаются. */
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  /** Проект вкладки «Список»: колонка «Статус» показывает статус в нём. */
  projectId?: string;
}

/** Таблица задач. Сортируемые заголовки — клиентские, строки рендерятся на сервере. */
export function TaskListTable({
  items,
  scope,
  basePath,
  searchParams,
  projectId,
}: TaskListTableProps) {
  const panel = parseTaskPanelParam(searchParams[TASK_PANEL_PARAM]);
  const openNumber = panel.mode === 'view' ? panel.number : null;
  return (
    <div className="overflow-x-auto rounded-lg border transition-opacity group-data-pending/list:opacity-60">
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
            <SortHeader sort="priority" label={TASK_LIST_SORT_LABELS.priority} />
            <SortHeader sort="due" label={TASK_LIST_SORT_LABELS.due} />
            <TableHead>Ответственный</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((task) => (
            <TableRow
              key={task.id}
              data-state={task.number === openNumber ? 'selected' : undefined}
            >
              <TableCell className="text-muted-foreground tabular-nums">{task.key}</TableCell>
              <TableCell className="max-w-80">
                <Link
                  href={taskPanelHref(basePath, searchParams, task.number)}
                  scroll={false}
                  aria-current={task.number === openNumber || undefined}
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
              <TableCell>
                <PriorityBadge priority={task.priority} />
              </TableCell>
              <TableCell>
                {task.dueDate && <DueDate value={task.dueDate} isOverdue={task.isOverdue} />}
              </TableCell>
              <TableCell>
                {task.assignee && (
                  <span className="flex items-center gap-2 text-sm">
                    <AssigneeAvatar user={task.assignee} />
                    <span className="truncate">{task.assignee.name}</span>
                  </span>
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
