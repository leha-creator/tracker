'use client';

import { useActionState, useEffect, type ReactNode } from 'react';

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
import type { FormState } from '@/shared/types';

interface ConfirmActionDialogProps {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Скрытые поля формы (id пространства, участника и т.п.). */
  fields: Record<string, string>;
  /** Кнопка-триггер. Без неё диалог управляется снаружи через `open` / `onOpenChange`. */
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Обычное (не разрушительное) действие — кнопка без красного цвета. */
  confirmVariant?: 'destructive' | 'default';
  open?: boolean;
  /** Вызывается и при закрытии после успешного ответа сервера. */
  onOpenChange?: (open: boolean) => void;
}

/** Подтверждение необратимого действия; ошибка сервера показывается внутри диалога. */
export function ConfirmActionDialog({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel,
  confirmVariant = 'destructive',
  open,
  onOpenChange,
}: ConfirmActionDialogProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const failure = state && !state.ok ? state : null;

  // Управляемый диалог закрывается после успеха; неуправляемый закроет сама перерисовка списка.
  useEffect(() => {
    if (state?.ok) onOpenChange?.(false);
  }, [state, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
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
            <Button type="submit" variant={confirmVariant} disabled={pending}>
              {pending ? 'Подождите…' : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
