'use client';

import { Plus } from 'lucide-react';
import { useActionState, useState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectStatusDto } from '@/modules/projects/client';
import { addToProjectAction } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { StatusSelect } from './task-fields';

interface AddToProjectFormProps {
  workspaceId: string;
  taskId: string;
  /** Проекты, в которых задачи ещё нет. */
  projects: { id: string; name: string }[];
  statusesByProject: Record<string, ProjectStatusDto[]>;
}

/**
 * «+ Добавить в проект»: по нажатию — проект и статус (по умолчанию первый статус проекта).
 * Раскрытые поля — в обычном виде: это активный ввод. После успеха список проектов меняется —
 * родитель пересоздаёт форму по key, и она снова свёрнута.
 */
export function AddToProjectForm({
  workspaceId,
  taskId,
  projects,
  statusesByProject,
}: AddToProjectFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addToProjectAction,
    null,
  );
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [statusId, setStatusId] = useState('');
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const error =
    fieldErrors?.projectId?.join(' ') ?? fieldErrors?.statusId?.join(' ') ?? failure?.error.message;

  if (projects.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus aria-hidden className="size-4" />
        Добавить в проект
      </button>
    );
  }

  function selectProject(next: string) {
    setProjectId(next);
    setStatusId(statusesByProject[next]?.[0]?.id ?? '');
  }

  return (
    <form action={formAction} className="grid gap-2 py-1" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="projectId" value={projectId} onValueChange={selectProject}>
          <SelectTrigger size="sm" className="w-44" aria-label="Проект">
            <SelectValue placeholder="Проект" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <StatusSelect
          statuses={statusesByProject[projectId] ?? []}
          value={statusId}
          onValueChange={setStatusId}
          disabled={!projectId}
          label="Статус в новом проекте"
        />
        <Button type="submit" size="sm" disabled={pending || !statusId}>
          {pending ? 'Добавляем…' : 'Добавить'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}
