'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useOptimistic } from 'react';
import { toast } from 'sonner';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
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

/** Размещение: проект → статус (смена сразу по выбору) и «Убрать из проекта». */
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
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <Link
        href={`/w/${workspaceSlug}/projects/${placement.projectId}/board`}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {placement.projectName}
      </Link>
      <StatusSelect
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
          <Button type="button" size="sm" variant="ghost">
            Убрать
          </Button>
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
    return (
      <p className="text-sm text-muted-foreground">Задача пока не добавлена ни в один проект.</p>
    );
  }
  return (
    <ul className="grid gap-2">
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
