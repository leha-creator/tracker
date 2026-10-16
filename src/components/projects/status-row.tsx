'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useState, type CSSProperties, type ReactNode, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  STATUS_NAME_MAX_LENGTH,
  updateStatusAction,
  type ProjectStatusDto,
} from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

import { DeleteStatusDialog } from './delete-status-dialog';
import { StatusDot } from './status-badge';
import { CategorySelect, ColorSelect } from './status-selects';
import { tasksLabel } from './tasks-label';

interface StatusRowProps {
  workspaceId: string;
  projectId: string;
  status: ProjectStatusDto;
  otherStatuses: ProjectStatusDto[];
  isOnly: boolean;
  /** Ручка перетаскивания (сортируемый список). */
  handle?: ReactNode;
  ref?: Ref<HTMLLIElement>;
  style?: CSSProperties;
  isDragging?: boolean;
}

/**
 * Статус в настройках: название, категория, цвет, удаление.
 * Узкий список (меньше `@3xl` у контейнера): строка 1 — ручка, название, счётчик, удаление;
 * строка 2 — категория и цвет; «Сохранить» появляется, только когда есть изменения.
 * Широкий — всё в одну строку.
 */
export function StatusRow({
  workspaceId,
  projectId,
  status,
  otherStatuses,
  isOnly,
  handle,
  ref,
  style,
  isDragging,
}: StatusRowProps) {
  const [updateState, updateAction, updatePending] = useActionState<FormState, FormData>(
    updateStatusAction,
    null,
  );
  const updateFailure = updateState && !updateState.ok ? updateState : null;
  // Ключ строки меняется вместе с данными сервера — после сохранения состояние сбрасывается.
  const [name, setName] = useState(status.name);
  const [category, setCategory] = useState(status.category);
  const [color, setColor] = useState(status.color);

  const dirty =
    name.trim() !== status.name || category !== status.category || color !== status.color;
  const error = updateFailure?.error.fieldErrors?.name?.join(' ') ?? updateFailure?.error.message;
  const nameId = `status-${status.id}-name`;
  const errorId = `status-${status.id}-error`;
  const ids = { workspaceId, projectId, statusId: status.id };

  return (
    <li
      ref={ref}
      style={style}
      className={cn(
        'grid gap-2 rounded-lg border bg-card p-2 @3xl:p-3',
        isDragging && 'relative z-10 shadow-card-hover ring-2 ring-primary/40',
      )}
    >
      <form
        action={updateAction}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 @3xl:flex"
        noValidate
      >
        {Object.entries(ids).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <div className="flex size-7 items-center justify-center">{handle}</div>
        <div className="flex min-w-0 items-center gap-2 @3xl:flex-1">
          <StatusDot color={color} />
          <label htmlFor={nameId} className="sr-only">
            Название статуса
          </label>
          <Input
            id={nameId}
            name="name"
            required
            maxLength={STATUS_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-8 min-w-0 flex-1"
          />
        </div>
        <div className="col-span-2 col-start-2 row-start-2 grid grid-cols-2 gap-2 @3xl:contents">
          <CategorySelect
            value={category}
            onChange={setCategory}
            label={`Категория статуса «${status.name}»`}
            className="w-full @3xl:w-36"
          />
          <ColorSelect
            value={color}
            onChange={setColor}
            label={`Цвет статуса «${status.name}»`}
            className="w-full @3xl:w-36"
          />
        </div>
        <div className="col-start-3 row-start-1 flex items-center gap-1 @3xl:order-last">
          {/* Фиксированная ширина на широком экране: поля всех строк стоят ровно друг под другом. */}
          <span className="px-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums @3xl:w-18 @3xl:text-right">
            {status.tasksCount > 0 ? tasksLabel(status.tasksCount) : 'нет задач'}
          </span>
          {!isOnly && (
            <DeleteStatusDialog
              workspaceId={workspaceId}
              projectId={projectId}
              status={status}
              otherStatuses={otherStatuses}
              trigger={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Удалить статус «${status.name}»`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              }
            />
          )}
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!dirty || updatePending}
          className={cn(
            'col-span-2 col-start-2 row-start-3 justify-self-end',
            !dirty && !updatePending && '@max-3xl:hidden',
          )}
        >
          {updatePending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </form>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive @3xl:pl-9">
          {error}
        </p>
      )}
    </li>
  );
}
