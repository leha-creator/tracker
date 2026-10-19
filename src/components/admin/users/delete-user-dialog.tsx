'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { deleteUserAction } from '@/modules/admin/client';
import type { FormState } from '@/shared/types';

interface DeleteUserDialogProps {
  user: { id: string; name: string; email: string };
  /** Адрес после удаления; без него диалог просто закрывается (список обновится сам). */
  afterDeleteHref?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Удаление навсегда — с вводом email. Совпадение проверяет и сервер; здесь — только чтобы кнопка
 * не была активна по ошибке. Ошибка «единственный владелец» показывается в диалоге.
 */
export function DeleteUserDialog({
  user,
  afterDeleteHref,
  open,
  onOpenChange,
}: DeleteUserDialogProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteUserAction, null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const matches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  useEffect(() => {
    if (!state?.ok) return;
    onOpenChange(false);
    if (afterDeleteHref) router.replace(afterDeleteHref);
  }, [state, onOpenChange, afterDeleteHref, router]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{user.name}» навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              Учётная запись, сессии и участие в пространствах будут удалены. Задачи и комментарии
              останутся без автора и ответственного. Отменить удаление нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="userId" value={user.id} />
          <FormField
            name="confirmEmail"
            label={`Введите email пользователя: ${user.email}`}
            autoComplete="off"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            errors={fieldErrors?.confirmEmail}
          />
          <FormError message={fieldErrors ? undefined : failure?.error.message} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending || !matches}>
              {pending ? 'Подождите…' : 'Удалить'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
