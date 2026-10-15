'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { TASK_TITLE_MAX_LENGTH, updateTaskAction, type TaskDto } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import {
  AssigneeField,
  DueDateField,
  PriorityField,
  TaskDescriptionField,
  type MemberOption,
} from './task-fields';

interface TaskDetailsFormProps {
  workspaceId: string;
  task: TaskDto;
  members: MemberOption[];
}

/** Поля задачи: название, описание, приоритет, срок, ответственный. */
export function TaskDetailsForm({ workspaceId, task, members }: TaskDetailsFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateTaskAction, null);
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  // Ответственный, вышедший из пространства, снимается триггером; на случай гонки — добавляем в список.
  const options =
    task.assignee && !members.some((member) => member.userId === task.assignee?.userId)
      ? [...members, { userId: task.assignee.userId, name: task.assignee.name }]
      : members;

  return (
    // key: после сохранения форма пересоздаётся с новыми значениями из props.
    <form key={task.updatedAt.toISOString()} action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={task.id} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="title"
        label="Название"
        required
        maxLength={TASK_TITLE_MAX_LENGTH}
        defaultValue={failure?.values.title ?? task.title}
        errors={fieldErrors?.title}
      />
      <TaskDescriptionField
        defaultValue={failure?.values.description ?? task.description ?? ''}
        errors={fieldErrors?.description}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <PriorityField defaultValue={task.priority} errors={fieldErrors?.priority} />
        <DueDateField
          defaultValue={failure?.values.dueDate ?? task.dueDate ?? ''}
          errors={fieldErrors?.dueDate}
        />
        <AssigneeField
          members={options}
          defaultValue={failure?.values.assigneeId ?? task.assignee?.userId}
          errors={fieldErrors?.assigneeId}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {state?.ok && !pending && (
          <span role="status" className="text-sm text-muted-foreground">
            Сохранено
          </span>
        )}
      </div>
    </form>
  );
}
