'use client';

import { Trash2Icon } from 'lucide-react';
import { useActionState, useState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { ColorSelect } from '@/components/projects/status-selects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createLabelFormAction,
  deleteLabelAction,
  TASK_LABEL_NAME_MAX_LENGTH,
  updateLabelAction,
  type TaskLabelColor,
  type TaskLabelDto,
} from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { LabelChip } from './label-chip';

function tasksCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} задача`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} задачи`;
  return `${count} задач`;
}

function CreateLabelForm({ workspaceId }: { workspaceId: string }) {
  const [color, setColor] = useState<TaskLabelColor>('gray');
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<FormState<TaskLabelDto>, FormData>(
    async (prev, formData) => {
      const result = await createLabelFormAction(prev, formData);
      // Успех — очищаем поле (новый key пересоздаёт форму).
      if (result?.ok) setFormKey((key) => key + 1);
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  return (
    <form key={formKey} action={formAction} className="grid gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          aria-label="Название новой метки"
          placeholder="Новая метка"
          required
          maxLength={TASK_LABEL_NAME_MAX_LENGTH}
          defaultValue={failure?.values.name ?? ''}
          aria-invalid={failure?.error.fieldErrors?.name ? true : undefined}
          className="h-8 min-w-40 flex-1"
        />
        <ColorSelect value={color} onChange={setColor} label="Цвет новой метки" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Создание…' : 'Добавить'}
        </Button>
      </div>
      <FormError message={failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message} />
    </form>
  );
}

function LabelRow({ workspaceId, label }: { workspaceId: string; label: TaskLabelDto }) {
  const [color, setColor] = useState(label.color);
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateLabelAction, null);
  const failure = state && !state.ok ? state : null;

  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0">
      {/* Диалог удаления — своя форма, поэтому он вне формы правки. */}
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction} className="contents">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="labelId" value={label.id} />
          <Input
            name="name"
            aria-label={`Название метки «${label.name}»`}
            defaultValue={failure?.values.name ?? label.name}
            required
            maxLength={TASK_LABEL_NAME_MAX_LENGTH}
            aria-invalid={failure?.error.fieldErrors?.name ? true : undefined}
            className="h-8 min-w-36 flex-1"
          />
          <ColorSelect value={color} onChange={setColor} label={`Цвет метки «${label.name}»`} />
          <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
            {tasksCountLabel(label.tasksCount)}
          </span>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </form>
        <ConfirmActionDialog
          action={deleteLabelAction}
          fields={{ workspaceId, labelId: label.id }}
          trigger={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Удалить метку «${label.name}»`}
              title="Удалить метку"
            >
              <Trash2Icon />
            </Button>
          }
          title={`Удалить метку «${label.name}»?`}
          description={
            label.tasksCount > 0
              ? `Метка снимется с ${label.tasksCount} ${label.tasksCount % 10 === 1 && label.tasksCount % 100 !== 11 ? 'задачи' : 'задач'}. Это нельзя отменить.`
              : 'Метка ни на одной задаче не стоит. Это нельзя отменить.'
          }
          confirmLabel="Удалить"
        />
      </div>
      <FormError message={failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message} />
    </li>
  );
}

/**
 * Метки пространства. С правом «Управление проектами» — правка, цвет и удаление; без него —
 * просмотр и создание (метку может завести любой участник, как и из задачи).
 */
export function LabelsManager({
  workspaceId,
  labels,
  canManage,
}: {
  workspaceId: string;
  labels: TaskLabelDto[];
  canManage: boolean;
}) {
  return (
    <div className="grid gap-6">
      {labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Меток пока нет. Создайте первую здесь или прямо в задаче — в свойстве «Метки».
        </p>
      ) : canManage ? (
        <ul className="grid divide-y">
          {labels.map((label) => (
            <LabelRow
              key={`${label.id}:${label.name}:${label.color}`}
              workspaceId={workspaceId}
              label={label}
            />
          ))}
        </ul>
      ) : (
        <ul className="grid divide-y">
          {labels.map((label) => (
            <li key={label.id} className="flex items-center justify-between gap-3 py-2">
              <LabelChip label={label} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {tasksCountLabel(label.tasksCount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t pt-4">
        <CreateLabelForm workspaceId={workspaceId} />
      </div>
    </div>
  );
}
