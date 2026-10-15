import { STATUS_LIMIT, type ProjectStatusDto } from '@/modules/projects/client';

import { AddStatusForm } from './add-status-form';
import { StatusRow } from './status-row';

interface StatusListProps {
  workspaceId: string;
  projectId: string;
  statuses: ProjectStatusDto[];
}

/** Набор статусов проекта по порядку и форма добавления. Инварианты проверяет сервер. */
export function StatusList({ workspaceId, projectId, statuses }: StatusListProps) {
  const atLimit = statuses.length >= STATUS_LIMIT;
  return (
    <div className="grid gap-4">
      <ol className="grid gap-2" aria-label="Статусы проекта">
        {statuses.map((status, index) => (
          <StatusRow
            // Ключ меняется вместе с данными: после сохранения строка берёт значения с сервера.
            key={`${status.id}:${status.name}:${status.category}:${status.color}`}
            workspaceId={workspaceId}
            projectId={projectId}
            status={status}
            isFirst={index === 0}
            isLast={index === statuses.length - 1}
            isOnly={statuses.length === 1}
          />
        ))}
      </ol>
      <AddStatusForm workspaceId={workspaceId} projectId={projectId} disabled={atLimit} />
      {atLimit && (
        <p className="text-sm text-muted-foreground">
          В проекте может быть не больше {STATUS_LIMIT} статусов.
        </p>
      )}
    </div>
  );
}
