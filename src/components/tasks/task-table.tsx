'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { FormError } from '@/components/forms/form-field';
import { StatusDot } from '@/components/projects/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { loadMoreTasksAction, type TaskListItemDto } from '@/modules/tasks/client';

import { AssigneeAvatar } from './assignee-avatar';
import { DueDate } from './due-date';
import { PriorityBadge } from './priority-badge';

interface TaskTableProps {
  workspaceId: string;
  workspaceSlug: string;
  items: TaskListItemDto[];
  nextCursor: string | null;
}

/** Задачи пространства: новые сверху, «Показать ещё» догружает следующую страницу. */
export function TaskTable({ workspaceId, workspaceSlug, items, nextCursor }: TaskTableProps) {
  const [more, setMore] = useState<{ items: TaskListItemDto[]; cursor: string | null }>({
    items: [],
    cursor: nextCursor,
  });
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const rows = [...items, ...more.items];

  function loadMore() {
    if (!more.cursor) return;
    const cursor = more.cursor;
    startTransition(async () => {
      const result = await loadMoreTasksAction({ workspaceId, cursor });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(undefined);
      setMore((prev) => ({
        items: [...prev.items, ...result.data.items],
        cursor: result.data.nextCursor,
      }));
    });
  }

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">№</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Проекты</TableHead>
              <TableHead>Приоритет</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Ответственный</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="text-muted-foreground tabular-nums">{task.key}</TableCell>
                <TableCell className="max-w-80">
                  <Link
                    href={`/w/${workspaceSlug}/tasks/${task.number}`}
                    className="line-clamp-2 font-medium whitespace-normal hover:underline"
                  >
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell>
                  {task.placements.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Вне проектов</span>
                  ) : (
                    <ul className="grid gap-1">
                      {task.placements.map((placement) => (
                        <li key={placement.projectId} className="flex items-center gap-1.5 text-xs">
                          <StatusDot color={placement.statusColor} />
                          <span className="truncate">
                            {placement.projectName}: {placement.statusName}
                          </span>
                        </li>
                      ))}
                    </ul>
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
      <FormError message={error} />
      {more.cursor && (
        <Button type="button" variant="outline" onClick={loadMore} disabled={pending}>
          {pending ? 'Загружаем…' : 'Показать ещё'}
        </Button>
      )}
    </div>
  );
}
