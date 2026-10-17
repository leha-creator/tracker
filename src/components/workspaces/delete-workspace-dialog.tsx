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
import {
  archiveWorkspaceAction,
  deleteWorkspaceAction,
  type FormState,
} from '@/modules/workspaces/client';

const TEXTS = {
  archive: {
    trigger: 'Архивировать пространство',
    title: (name: string) => `Архивировать «${name}»?`,
    description:
      'Пространство пропадёт у всех участников, токены агентов и GitHub перестанут работать. Данные сохранятся — восстановить его можно с главной страницы.',
    confirm: 'В архив',
    pending: 'Архивируем…',
  },
  delete: {
    trigger: 'Удалить навсегда',
    title: (name: string) => `Удалить «${name}»?`,
    description:
      'Пространство, участники и приглашения будут удалены без возможности восстановления.',
    confirm: 'Удалить навсегда',
    pending: 'Удаляем…',
  },
} as const;

/**
 * Архивирование или удаление пространства с подтверждением вводом названия (сервер проверяет
 * совпадение сам). Удалить навсегда можно только пространство из архива.
 */
export function DeleteWorkspaceDialog({
  workspaceId,
  name,
  mode = 'delete',
  triggerSize,
}: {
  workspaceId: string;
  name: string;
  mode?: 'archive' | 'delete';
  triggerSize?: 'sm';
}) {
  const text = TEXTS[mode];
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    mode === 'archive' ? archiveWorkspaceAction : deleteWorkspaceAction,
    null,
  );
  const [confirmName, setConfirmName] = useState('');
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={mode === 'archive' ? 'outline' : 'destructive'} size={triggerSize}>
          {text.trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4" noValidate>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.title(name)}</AlertDialogTitle>
            <AlertDialogDescription>
              {text.description} Введите название пространства, чтобы подтвердить.
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
              variant={mode === 'archive' ? 'default' : 'destructive'}
              disabled={pending || confirmName.trim() !== name}
            >
              {pending ? text.pending : text.confirm}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
