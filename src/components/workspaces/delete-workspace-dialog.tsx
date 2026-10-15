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
import { deleteWorkspaceAction, type FormState } from '@/modules/workspaces/client';

/** Удаление пространства с подтверждением вводом названия (сервер проверяет совпадение сам). */
export function DeleteWorkspaceDialog({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    deleteWorkspaceAction,
    null,
  );
  const [confirmName, setConfirmName] = useState('');
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Удалить пространство</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4" noValidate>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Пространство, участники и приглашения будут удалены без возможности восстановления.
              Введите название пространства, чтобы подтвердить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <FormError message={fieldErrors ? undefined : failure?.error.message} />
          <FormField
            name="confirmName"
            label="Название пространства"
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
