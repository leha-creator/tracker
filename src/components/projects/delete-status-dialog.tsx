'use client';

import { useActionState, useState, type ReactNode } from 'react';

import { FormError } from '@/components/forms/form-field';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deleteStatusAction, type ProjectStatusDto } from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

import { StatusDot } from './status-badge';

interface DeleteStatusDialogProps {
  workspaceId: string;
  projectId: string;
  status: ProjectStatusDto;
  /** Остальные статусы проекта — куда перенести задачи. */
  otherStatuses: ProjectStatusDto[];
  trigger: ReactNode;
}

function tasksLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} задача`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} задачи`;
  return `${count} задач`;
}

/** Удаление статуса. Если в нём есть задачи — выбор статуса, куда их перенести. */
export function DeleteStatusDialog({
  workspaceId,
  projectId,
  status,
  otherStatuses,
  trigger,
}: DeleteStatusDialogProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    deleteStatusAction,
    null,
  );
  const hasTasks = status.tasksCount > 0;
  const [moveToStatusId, setMoveToStatusId] = useState(otherStatuses[0]?.id ?? '');
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.moveToStatusId?.join(' ') ?? failure?.error.message;
  const selectId = `move-to-${status.id}`;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить статус «{status.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasTasks
                ? `Колонка исчезнет с доски. В ней ${tasksLabel(status.tasksCount)} — выберите статус, куда их перенести.`
                : 'Колонка исчезнет с доски проекта.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="statusId" value={status.id} />
          {hasTasks && (
            <div className="grid gap-2">
              <Label htmlFor={selectId}>Перенести задачи в</Label>
              <Select
                name="moveToStatusId"
                value={moveToStatusId}
                onValueChange={setMoveToStatusId}
              >
                <SelectTrigger id={selectId} className="w-full">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  {otherStatuses.map((other) => (
                    <SelectItem key={other.id} value={other.id}>
                      <StatusDot color={other.color} />
                      {other.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <FormError message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            {/* Обычная кнопка submit: AlertDialogAction закрыл бы диалог до ответа сервера. */}
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || (hasTasks && !moveToStatusId)}
            >
              {pending ? 'Подождите…' : hasTasks ? 'Перенести и удалить' : 'Удалить'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
