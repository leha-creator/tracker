'use client';

import { useActionState, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
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
import { createTaskAction, TASK_TITLE_MAX_LENGTH } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import {
  AssigneeField,
  DueDateField,
  PriorityField,
  StatusSelect,
  TaskDescriptionField,
  type MemberOption,
} from './task-fields';

const NO_PROJECT = '__none__';

interface CreateTaskFormProps {
  workspaceId: string;
  members: MemberOption[];
  projects: { id: string; name: string }[];
  statusesByProject: Record<string, ProjectStatusDto[]>;
  /** Проект, выбранный заранее (`?projectId=`). */
  defaultProjectId?: string;
}

/** Новая задача: поля задачи и необязательное размещение в проекте. */
export function CreateTaskForm({
  workspaceId,
  members,
  projects,
  statusesByProject,
  defaultProjectId,
}: CreateTaskFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createTaskAction, null);
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const initialProject =
    failure?.values.projectId ||
    (defaultProjectId && statusesByProject[defaultProjectId] ? defaultProjectId : '');
  const [projectId, setProjectId] = useState(initialProject);
  const [statusId, setStatusId] = useState(
    failure?.values.statusId || (statusesByProject[initialProject]?.[0]?.id ?? ''),
  );

  function selectProject(next: string) {
    const id = next === NO_PROJECT ? '' : next;
    setProjectId(id);
    setStatusId(statusesByProject[id]?.[0]?.id ?? '');
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="title"
        label="Название"
        required
        autoFocus
        maxLength={TASK_TITLE_MAX_LENGTH}
        defaultValue={failure?.values.title}
        errors={fieldErrors?.title}
      />
      <TaskDescriptionField
        defaultValue={failure?.values.description}
        errors={fieldErrors?.description}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <PriorityField errors={fieldErrors?.priority} />
        <DueDateField defaultValue={failure?.values.dueDate} errors={fieldErrors?.dueDate} />
        <AssigneeField
          members={members}
          defaultValue={failure?.values.assigneeId}
          errors={fieldErrors?.assigneeId}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="projectId">Проект и статус</Label>
        <input type="hidden" name="projectId" value={projectId} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={projectId || NO_PROJECT} onValueChange={selectProject}>
            <SelectTrigger id="projectId" size="sm" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>Без проекта</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectId && (
            <StatusSelect
              statuses={statusesByProject[projectId] ?? []}
              value={statusId}
              onValueChange={setStatusId}
              label="Статус в проекте"
            />
          )}
        </div>
        {(fieldErrors?.statusId ?? fieldErrors?.projectId) && (
          <p className="text-sm text-destructive">
            {(fieldErrors?.statusId ?? fieldErrors?.projectId)?.join(' ')}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? 'Создаём…' : 'Создать задачу'}
      </Button>
    </form>
  );
}
