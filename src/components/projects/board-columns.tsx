import { STATUS_CATEGORY_LABELS, type ProjectStatusDto } from '@/modules/projects';

import { StatusDot } from './status-badge';

/** Колонки доски по статусам проекта. Карточки задач появятся на этапе «Задачи». */
export function BoardColumns({ statuses }: { statuses: ProjectStatusDto[] }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <ol className="flex min-w-max gap-3" aria-label="Колонки доски">
        {statuses.map((status) => (
          <li
            key={status.id}
            className="flex w-64 shrink-0 flex-col gap-3 rounded-xl bg-muted/50 p-3"
          >
            <div className="flex items-center gap-2">
              <StatusDot color={status.color} />
              <h3 className="truncate text-sm font-medium">{status.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {STATUS_CATEGORY_LABELS[status.category]}
            </p>
            <div className="grid min-h-24 place-items-center rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              Задачи появятся на следующем этапе
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
