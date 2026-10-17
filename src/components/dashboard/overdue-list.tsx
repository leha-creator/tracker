import Link from 'next/link';

import type { TaskListItemDto } from '@/modules/tasks/client';

import { AssigneeAvatar } from '@/components/tasks/assignee-avatar';
import { DueDate } from '@/components/tasks/due-date';

/** Самые давние просроченные задачи; строка открывает задачу в панели списка. */
export function OverdueList({
  tasks,
  workspaceSlug,
}: {
  tasks: TaskListItemDto[];
  workspaceSlug: string;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">Просроченных задач нет.</p>;
  }
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)]">
      {tasks.map((task) => (
        <li key={task.id} className="border-t first:border-t-0">
          <Link
            href={`/w/${workspaceSlug}/tasks?task=${task.number}`}
            scroll={false}
            className="flex min-w-0 items-center gap-3 rounded-sm py-2 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{task.key}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
            {task.dueDate && <DueDate value={task.dueDate} isOverdue />}
            {task.assignee ? (
              <AssigneeAvatar user={task.assignee} />
            ) : (
              <span className="sr-only">Не назначена</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
