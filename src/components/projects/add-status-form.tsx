'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addStatusAction,
  STATUS_NAME_MAX_LENGTH,
  type StatusCategory,
  type StatusColor,
} from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

import { CategorySelect, ColorSelect } from './status-selects';

interface AddStatusFormProps {
  workspaceId: string;
  projectId: string;
  disabled: boolean;
}

export function AddStatusForm({ workspaceId, projectId, disabled }: AddStatusFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addStatusAction, null);
  const [category, setCategory] = useState<StatusCategory>('todo');
  const [color, setColor] = useState<StatusColor>('gray');
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message;

  return (
    <form action={formAction} className="grid gap-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="new-status-name" className="sr-only">
          Название нового статуса
        </label>
        <Input
          id="new-status-name"
          name="name"
          required
          placeholder="Новый статус"
          maxLength={STATUS_NAME_MAX_LENGTH}
          defaultValue={failure?.values.name}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'new-status-error' : undefined}
          className="h-8 min-w-40 flex-1"
        />
        <CategorySelect
          value={category}
          onChange={setCategory}
          label="Категория нового статуса"
          disabled={disabled}
        />
        <ColorSelect
          value={color}
          onChange={setColor}
          label="Цвет нового статуса"
          disabled={disabled}
        />
        <Button type="submit" size="sm" disabled={disabled || pending}>
          {pending ? 'Добавляем…' : 'Добавить'}
        </Button>
      </div>
      {error && (
        <p id="new-status-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
