'use client';

import { useActionState, type ReactNode } from 'react';

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
import type { FormState } from '@/modules/workspaces/client';

interface ConfirmActionDialogProps {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Скрытые поля формы (id пространства, участника и т.п.). */
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
}

/** Подтверждение необратимого действия; ошибка сервера показывается внутри диалога. */
export function ConfirmActionDialog({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel,
}: ConfirmActionDialogProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const failure = state && !state.ok ? state : null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <FormError message={failure?.error.message} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            {/* Обычная кнопка submit: AlertDialogAction закрыл бы диалог до ответа сервера. */}
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Подождите…' : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
