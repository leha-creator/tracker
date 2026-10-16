'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useActionState, useEffect, useOptimistic } from 'react';
import { toast } from 'sonner';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import type { ProjectStatusDto } from '@/modules/projects/client';
import {
  changeStatusAction,
  removeFromProjectAction,
  type TaskPlacementDto,
} from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { StatusSelect } from './task-fields';

interface PlacementRowProps {
  workspaceId: string;
  workspaceSlug: string;
  taskId: string;
  placement: TaskPlacementDto;
  statuses: ProjectStatusDto[];
}

/**
 * Размещение: проект → статус (смена сразу по выбору) и «×» — убрать из проекта.
 * В покое строка читается как текст; «×» и стрелка статуса появляются при наведении и фокусе.
 */
function PlacementRow({
  workspaceId,
  workspaceSlug,
  taskId,
  placement,
  statuses,
}: PlacementRowProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeStatusAction, null);
  // Выбранный статус виден сразу; при ошибке переход завершается и значение откатывается само.
  const [statusId, setOptimisticStatusId] = useOptimistic(placement.statusId);
  const ids = { workspaceId, taskId, projectId: placement.projectId };

  useEffect(() => {
    if (state && !state.ok) toast.error(state.error.message);
  }, [state]);

  function change(next: string) {
    const formData = new FormData();
    Object.entries(ids).forEach(([key, value]) => formData.set(key, value));
    formData.set('statusId', next);
    startTransition(() => {
      setOptimisticStatusId(next);
      action(formData);
    });
  }

  return (
    <li className="group/placement flex min-h-8 min-w-0 flex-wrap items-center gap-x-1">
      <Link
        href={`/w/${workspaceSlug}/projects/${placement.projectId}/board`}
        className="min-w-0 shrink truncate rounded-sm text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {placement.projectName}
      </Link>
      <StatusSelect
        quiet
        statuses={statuses}
        value={statusId}
        onValueChange={change}
        disabled={pending}
        label={`Статус в проекте «${placement.projectName}»`}
      />
      <ConfirmActionDialog
        action={removeFromProjectAction}
        fields={ids}
        trigger={
          <button
            type="button"
            aria-label={`Убрать из проекта «${placement.projectName}»`}
            title="Убрать из проекта"
            className="ml-auto grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity outline-none group-focus-within/placement:opacity-100 group-hover/placement:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:opacity-100"
          >
            <X className="size-4" />
          </button>
        }
        title={`Убрать задачу из проекта «${placement.projectName}»?`}
        description="Карточка исчезнет с доски проекта. Задача останется в пространстве."
        confirmLabel="Убрать"
      />
    </li>
  );
}

interface TaskPlacementsProps {
  workspaceId: string;
  workspaceSlug: string;
  taskId: string;
  placements: TaskPlacementDto[];
  statusesByProject: Record<string, ProjectStatusDto[]>;
}

export function TaskPlacements({
  workspaceId,
  workspaceSlug,
  taskId,
  placements,
  statusesByProject,
}: TaskPlacementsProps) {
  if (placements.length === 0) {
    return <p className="py-1.5 text-sm text-muted-foreground">Не добавлена в проекты</p>;
  }
  return (
    <ul className="grid min-w-0">
      {placements.map((placement) => (
        <PlacementRow
          // key со статусом: после revalidate строка пересоздаётся с актуальным статусом.
          key={`${placement.projectId}:${placement.statusId}`}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          taskId={taskId}
          placement={placement}
          statuses={statusesByProject[placement.projectId] ?? []}
        />
      ))}
    </ul>
  );
}
