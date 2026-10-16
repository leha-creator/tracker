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

import { StatusDot } from './status-badge';
import { CategorySelect, ColorSelect } from './status-selects';

interface AddStatusFormProps {
  workspaceId: string;
  projectId: string;
  disabled: boolean;
}

/** Новый статус в конец набора. Сетка повторяет строку статуса (`StatusRow`). */
export function AddStatusForm({ workspaceId, projectId, disabled }: AddStatusFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addStatusAction, null);
  const [category, setCategory] = useState<StatusCategory>('todo');
  const [color, setColor] = useState<StatusColor>('gray');
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message;

  return (
    <form
      action={formAction}
      className="grid gap-2 rounded-lg border border-dashed bg-muted/40 p-2 @3xl:p-3"
      noValidate
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 @3xl:flex">
        <div aria-hidden className="size-7" />
        <div className="flex min-w-0 items-center gap-2 @3xl:flex-1">
          <StatusDot color={color} />
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
            className="h-8 min-w-0 flex-1"
          />
        </div>
        <div className="col-start-2 grid grid-cols-2 gap-2 @3xl:contents">
          <CategorySelect
            value={category}
            onChange={setCategory}
            label="Категория нового статуса"
            disabled={disabled}
            className="w-full @3xl:w-36"
          />
          <ColorSelect
            value={color}
            onChange={setColor}
            label="Цвет нового статуса"
            disabled={disabled}
            className="w-full @3xl:w-36"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={disabled || pending}
          className="col-start-2 justify-self-end"
        >
          {pending ? 'Добавляем…' : 'Добавить'}
        </Button>
      </div>
      {error && (
        <p id="new-status-error" role="alert" className="text-sm text-destructive @3xl:pl-9">
          {error}
        </p>
      )}
    </form>
  );
}
