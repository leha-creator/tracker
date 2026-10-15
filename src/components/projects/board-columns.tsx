import { QuickCreateTask } from '@/components/tasks/quick-create-task';
import { TaskCard } from '@/components/tasks/task-card';
import { STATUS_CATEGORY_LABELS, type ProjectStatusDto } from '@/modules/projects/client';
import type { BoardCardsDto } from '@/modules/tasks/client';

import { StatusDot } from './status-badge';

interface BoardColumnsProps {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  statuses: ProjectStatusDto[];
  cards: BoardCardsDto;
}

/** Колонки доски по статусам проекта с карточками задач (порядок — по позиции). */
export function BoardColumns({
  workspaceId,
  workspaceSlug,
  projectId,
  statuses,
  cards,
}: BoardColumnsProps) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <ol className="flex min-w-max items-start gap-3" aria-label="Колонки доски">
        {statuses.map((status) => {
          const columnCards = cards[status.id] ?? [];
          return (
            <li
              key={status.id}
              aria-label={`${status.name}: ${columnCards.length}`}
              className="flex w-72 shrink-0 flex-col gap-3 rounded-xl bg-muted/50 p-3"
            >
              <div className="flex items-center gap-2">
                <StatusDot color={status.color} />
                <h3 className="truncate text-sm font-medium">{status.name}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {columnCards.length}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {STATUS_CATEGORY_LABELS[status.category]}
                </span>
              </div>
              {columnCards.length > 0 ? (
                <ul className="grid gap-2">
                  {columnCards.map((card) => (
                    <li key={card.taskId}>
                      <TaskCard card={card} href={`/w/${workspaceSlug}/tasks/${card.number}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Нет задач
                </p>
              )}
              <QuickCreateTask
                workspaceId={workspaceId}
                projectId={projectId}
                statusId={status.id}
                statusName={status.name}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
