'use client';

import { Plus, X } from 'lucide-react';
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

/**
 * Новый статус в конец набора. Свёрнут в тихую кнопку «Добавить статус»; раскрытая форма
 * повторяет колонки строки статуса (`StatusRow`): поля стоят ровно под полями строк.
 */
export function AddStatusForm({ workspaceId, projectId, disabled }: AddStatusFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addStatusAction, null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<StatusCategory>('todo');
  const [color, setColor] = useState<StatusColor>('gray');
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message;

  if (!open) {
    return (
      <div className="@3xl:pl-9">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <Plus />
          Добавить статус
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onKeyDown={(event) => {
        // Esc из выпадающего списка (портал вне формы) закрывает только список.
        const inForm = event.target instanceof Node && event.currentTarget.contains(event.target);
        if (event.key === 'Escape' && inForm && !event.defaultPrevented) setOpen(false);
      }}
      className="grid gap-2"
      noValidate
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 @3xl:flex">
        <div aria-hidden className="size-7" />
        <div className="flex min-w-0 items-center gap-2 @3xl:flex-1">
          <label htmlFor="new-status-name" className="sr-only">
            Название нового статуса
          </label>
          <Input
            id="new-status-name"
            name="name"
            required
            autoFocus
            placeholder="Название статуса"
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
        <div className="col-start-2 flex items-center justify-end gap-1 @3xl:contents">
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={disabled || pending}
            className="@3xl:w-24"
          >
            {pending ? 'Добавляем…' : 'Добавить'}
          </Button>
          {/* Как у строки статуса: место счётчика задач и иконочная кнопка справа. */}
          <div className="flex items-center gap-1">
            <span aria-hidden className="hidden @3xl:block @3xl:w-18" />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Отменить добавление статуса"
              onClick={() => setOpen(false)}
              className="text-muted-foreground"
            >
              <X />
            </Button>
          </div>
        </div>
      </div>
      {error && (
        <p id="new-status-error" role="alert" className="text-sm text-destructive @3xl:pl-9">
          {error}
        </p>
      )}
    </form>
  );
}
