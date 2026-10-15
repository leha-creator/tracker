'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
 * Добавление задачи в проект: проект → статус (по умолчанию первый статус проекта).
 * После успеха список проектов меняется — родитель пересоздаёт форму по key.
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
  const [projectId, setProjectId] = useState('');
  const [statusId, setStatusId] = useState('');
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const error =
    fieldErrors?.projectId?.join(' ') ?? fieldErrors?.statusId?.join(' ') ?? failure?.error.message;

  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">Задача уже во всех проектах.</p>;
  }

  function selectProject(next: string) {
    setProjectId(next);
    setStatusId(statusesByProject[next]?.[0]?.id ?? '');
  }

  return (
    <form action={formAction} className="grid gap-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Label htmlFor="add-project">Добавить в проект</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select name="projectId" value={projectId} onValueChange={selectProject}>
          <SelectTrigger id="add-project" size="sm" className="w-44">
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
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !statusId}>
          {pending ? 'Добавляем…' : 'Добавить'}
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}
