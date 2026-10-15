'use client';

import { useState } from 'react';

import { StatusDot } from '@/components/projects/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectStatusDto } from '@/modules/projects/client';
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskPriority,
} from '@/modules/tasks/client';

/** Участник пространства в селекте ответственного. */
export interface MemberOption {
  userId: string;
  name: string;
}

// У radix Select нет пустого значения: «не выбрано» — отдельный ключ, в форму уходит ''.
const NONE = '__none__';

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {errors.join(' ')}
    </p>
  );
}

export function TaskDescriptionField({
  defaultValue,
  errors,
}: {
  defaultValue?: string;
  errors?: string[];
}) {
  const hasErrors = Boolean(errors?.length);
  return (
    <div className="grid gap-2">
      <Label htmlFor="description">Описание</Label>
      <Textarea
        id="description"
        name="description"
        rows={6}
        maxLength={TASK_DESCRIPTION_MAX_LENGTH}
        defaultValue={defaultValue}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors ? 'description-error' : undefined}
      />
      <FieldErrors id="description-error" errors={errors} />
    </div>
  );
}

export function PriorityField({
  defaultValue = 'none',
  errors,
}: {
  defaultValue?: TaskPriority;
  errors?: string[];
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="priority">Приоритет</Label>
      <Select name="priority" defaultValue={defaultValue}>
        <SelectTrigger id="priority" className="w-full" aria-invalid={errors ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {TASK_PRIORITY_LABELS[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldErrors id="priority-error" errors={errors} />
    </div>
  );
}

export function DueDateField({
  defaultValue,
  errors,
}: {
  defaultValue?: string;
  errors?: string[];
}) {
  const hasErrors = Boolean(errors?.length);
  return (
    <div className="grid gap-2">
      <Label htmlFor="dueDate">Срок</Label>
      <Input
        id="dueDate"
        name="dueDate"
        type="date"
        defaultValue={defaultValue}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors ? 'dueDate-error' : undefined}
      />
      <FieldErrors id="dueDate-error" errors={errors} />
    </div>
  );
}

export function AssigneeField({
  members,
  defaultValue,
  errors,
}: {
  members: MemberOption[];
  defaultValue?: string;
  errors?: string[];
}) {
  const [value, setValue] = useState(defaultValue || NONE);
  return (
    <div className="grid gap-2">
      <Label htmlFor="assigneeId">Ответственный</Label>
      <input type="hidden" name="assigneeId" value={value === NONE ? '' : value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger
          id="assigneeId"
          className="w-full"
          aria-invalid={errors ? true : undefined}
          aria-describedby={errors ? 'assigneeId-error' : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Не назначен</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldErrors id="assigneeId-error" errors={errors} />
    </div>
  );
}

/** Выбор статуса проекта; значение уходит в форму полем `name`. */
export function StatusSelect({
  statuses,
  value,
  onValueChange,
  name = 'statusId',
  label,
  disabled,
  id,
}: {
  statuses: ProjectStatusDto[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} size="sm" aria-label={label} className="w-44">
        <SelectValue placeholder="Статус" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <StatusDot color={status.color} />
            {status.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
