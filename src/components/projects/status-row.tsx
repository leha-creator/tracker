'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { startTransition, useActionState, useState } from 'react';

import { ConfirmActionDialog } from '@/components/workspaces/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  deleteStatusAction,
  moveStatusAction,
  STATUS_NAME_MAX_LENGTH,
  updateStatusAction,
  type ProjectStatusDto,
} from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

import { StatusDot } from './status-badge';
import { CategorySelect, ColorSelect } from './status-selects';

interface StatusRowProps {
  workspaceId: string;
  projectId: string;
  status: ProjectStatusDto;
  isFirst: boolean;
  isLast: boolean;
  isOnly: boolean;
}

/** Статус в настройках: название, категория, цвет, порядок, удаление. */
export function StatusRow({
  workspaceId,
  projectId,
  status,
  isFirst,
  isLast,
  isOnly,
}: StatusRowProps) {
  const [updateState, updateAction, updatePending] = useActionState<FormState, FormData>(
    updateStatusAction,
    null,
  );
  const [moveState, moveAction, movePending] = useActionState<FormState, FormData>(
    moveStatusAction,
    null,
  );
  const [category, setCategory] = useState(status.category);
  const [color, setColor] = useState(status.color);

  const updateFailure = updateState && !updateState.ok ? updateState : null;
  const error =
    updateFailure?.error.fieldErrors?.name?.join(' ') ??
    updateFailure?.error.message ??
    (moveState && !moveState.ok ? moveState.error.message : undefined);
  const nameId = `status-${status.id}-name`;
  const errorId = `status-${status.id}-error`;
  const ids = { workspaceId, projectId, statusId: status.id };

  function move(direction: 'up' | 'down') {
    const formData = new FormData();
    Object.entries(ids).forEach(([key, value]) => formData.set(key, value));
    formData.set('direction', direction);
    startTransition(() => moveAction(formData));
  }

  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <form action={updateAction} className="flex flex-wrap items-center gap-2" noValidate>
        {Object.entries(ids).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <StatusDot color={color} />
        <label htmlFor={nameId} className="sr-only">
          Название статуса
        </label>
        <Input
          id={nameId}
          name="name"
          required
          maxLength={STATUS_NAME_MAX_LENGTH}
          defaultValue={updateFailure?.values.name ?? status.name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-8 min-w-40 flex-1"
        />
        <CategorySelect
          value={category}
          onChange={setCategory}
          label={`Категория статуса «${status.name}»`}
        />
        <ColorSelect value={color} onChange={setColor} label={`Цвет статуса «${status.name}»`} />
        <Button type="submit" size="sm" variant="secondary" disabled={updatePending}>
          {updatePending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Переместить «${status.name}» выше`}
            disabled={isFirst || movePending}
            onClick={() => move('up')}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Переместить «${status.name}» ниже`}
            disabled={isLast || movePending}
            onClick={() => move('down')}
          >
            <ArrowDown />
          </Button>
          <ConfirmActionDialog
            action={deleteStatusAction}
            fields={ids}
            trigger={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isOnly}
                title={isOnly ? 'В проекте должен остаться хотя бы один статус' : undefined}
              >
                Удалить
              </Button>
            }
            title={`Удалить статус «${status.name}»?`}
            description="Колонка исчезнет с доски проекта."
            confirmLabel="Удалить"
          />
        </div>
      </form>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
