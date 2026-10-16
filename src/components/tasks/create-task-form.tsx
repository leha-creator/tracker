'use client';

import Link from 'next/link';
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
import { createTaskAction, type TaskPriority } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { TaskProperty, TaskPropertyList } from './task-panel/task-property';
import {
  AssigneeSelect,
  DueDatePicker,
  FieldErrors,
  PrioritySelect,
  QUIET_SELECT_TRIGGER,
  StatusSelect,
  TaskDescriptionInput,
  TaskTitleInput,
  type MemberOption,
} from './task-fields';

const NO_PROJECT = '__none__';

interface CreateTaskFormProps {
  workspaceId: string;
  members: MemberOption[];
  projects: { id: string; name: string }[];
  statusesByProject: Record<string, ProjectStatusDto[]>;
  /** Проект, выбранный заранее (доска или список проекта, `?projectId=`). */
  defaultProjectId?: string;
  /** Страница под панелью: после создания на ней откроется новая задача. */
  returnTo?: string;
  /** «Отмена». */
  closeHref: string;
  /** Родитель: форма создаёт его подзадачу. */
  parent?: { id: string; key: string; title: string };
}

/**
 * Новая задача в той же компоновке, что открытая: крупное название, свойства, описание.
 * Внизу закреплены «Создать задачу» и «Отмена»; Ctrl/⌘+Enter отправляет форму.
 */
export function CreateTaskForm({
  workspaceId,
  members,
  projects,
  statusesByProject,
  defaultProjectId,
  returnTo,
  closeHref,
  parent,
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
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const placementErrors = fieldErrors?.statusId ?? fieldErrors?.projectId;

  function selectProject(next: string) {
    const id = next === NO_PROJECT ? '' : next;
    setProjectId(id);
    setStatusId(statusesByProject[id]?.[0]?.id ?? '');
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {parent && <input type="hidden" name="parentId" value={parent.id} />}

      <div className="@container grid flex-1 content-start gap-6 px-4 py-5 sm:px-6">
        <FormError message={fieldErrors ? undefined : failure?.error.message} />
        <div className="grid gap-1">
          {parent && (
            <p className="flex min-w-0 items-baseline gap-1.5 text-sm text-muted-foreground">
              Подзадача для
              <span className="shrink-0 font-mono text-xs tabular-nums">{parent.key}</span>
              <span className="truncate text-foreground">{parent.title}</span>
            </p>
          )}
          <TaskTitleInput
            id="new-task-title"
            name="title"
            autoFocus
            defaultValue={failure?.values.title}
            invalid={Boolean(fieldErrors?.title)}
            describedBy={fieldErrors?.title ? 'new-task-title-error' : undefined}
          />
          <FieldErrors id="new-task-title-error" errors={fieldErrors?.title} />
        </div>

        <TaskPropertyList>
          <TaskProperty labelId="new-task-assignee-label" label="Ответственный">
            <AssigneeSelect
              id="new-task-assignee"
              labelledBy="new-task-assignee-label"
              name="assigneeId"
              members={members}
              value={assigneeId}
              onChange={setAssigneeId}
              invalid={Boolean(fieldErrors?.assigneeId)}
            />
          </TaskProperty>
          <TaskProperty labelId="new-task-due-label" label="Срок">
            <DueDatePicker
              id="new-task-due"
              labelledBy="new-task-due-label"
              name="dueDate"
              value={dueDate}
              onChange={setDueDate}
              invalid={Boolean(fieldErrors?.dueDate)}
            />
          </TaskProperty>
          <TaskProperty labelId="new-task-priority-label" label="Приоритет">
            <PrioritySelect
              id="new-task-priority"
              labelledBy="new-task-priority-label"
              name="priority"
              value={priority}
              onChange={setPriority}
              invalid={Boolean(fieldErrors?.priority)}
            />
          </TaskProperty>
          <TaskProperty labelId="new-task-project-label" label="Проект">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="-ml-2 flex min-w-0 flex-wrap items-center gap-1">
              <Select value={projectId || NO_PROJECT} onValueChange={selectProject}>
                <SelectTrigger
                  id="new-task-project"
                  aria-labelledby="new-task-project-label"
                  aria-invalid={placementErrors ? true : undefined}
                  className={QUIET_SELECT_TRIGGER}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>
                    <span className="text-muted-foreground">Без проекта</span>
                  </SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projectId && (
                <StatusSelect
                  quiet
                  statuses={statusesByProject[projectId] ?? []}
                  value={statusId}
                  onValueChange={setStatusId}
                  label="Статус в проекте"
                />
              )}
            </div>
          </TaskProperty>
        </TaskPropertyList>
        <FieldErrors id="new-task-placement-error" errors={placementErrors} />
        {(fieldErrors?.assigneeId ?? fieldErrors?.dueDate ?? fieldErrors?.priority) && (
          <FieldErrors
            id="new-task-fields-error"
            errors={[
              ...(fieldErrors.assigneeId ?? []),
              ...(fieldErrors.dueDate ?? []),
              ...(fieldErrors.priority ?? []),
            ]}
          />
        )}

        <section aria-labelledby="new-task-description-heading" className="grid gap-1.5">
          <h3 id="new-task-description-heading" className="text-sm font-semibold">
            Описание
          </h3>
          <TaskDescriptionInput
            id="new-task-description"
            name="description"
            labelledBy="new-task-description-heading"
            defaultValue={failure?.values.description}
            invalid={Boolean(fieldErrors?.description)}
            describedBy={fieldErrors?.description ? 'new-task-description-error' : undefined}
            className="min-h-24"
          />
          <FieldErrors id="new-task-description-error" errors={fieldErrors?.description} />
        </section>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 sm:px-6">
        <Button type="submit" disabled={pending}>
          {pending ? 'Создаём…' : 'Создать задачу'}
        </Button>
        <Button asChild type="button" variant="ghost">
          <Link href={closeHref} scroll={false}>
            Отмена
          </Link>
        </Button>
        <span className="ml-auto text-xs text-muted-foreground max-sm:hidden">
          Ctrl+Enter — создать
        </span>
      </div>
    </form>
  );
}
