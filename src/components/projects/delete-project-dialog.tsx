'use client';

import { useActionState, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
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
import { deleteProjectAction } from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

interface DeleteProjectDialogProps {
  workspaceId: string;
  projectId: string;
  name: string;
}

/** Удаление проекта с подтверждением вводом названия (сервер проверяет совпадение сам). */
export function DeleteProjectDialog({ workspaceId, projectId, name }: DeleteProjectDialogProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    deleteProjectAction,
    null,
  );
  const [confirmName, setConfirmName] = useState('');
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Удалить проект</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4" noValidate>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Проект и его статусы будут удалены без возможности восстановления. Введите название
              проекта, чтобы подтвердить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="projectId" value={projectId} />
          <FormError message={fieldErrors ? undefined : failure?.error.message} />
          <FormField
            name="confirmName"
            label="Название проекта"
            autoComplete="off"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            errors={fieldErrors?.confirmName}
          />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            {/* Обычная кнопка submit: AlertDialogAction закрыл бы диалог до ответа сервера. */}
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || confirmName.trim() !== name}
            >
              {pending ? 'Удаляем…' : 'Удалить навсегда'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
