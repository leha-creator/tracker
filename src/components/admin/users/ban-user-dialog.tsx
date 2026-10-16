'use client';

import { useActionState, useEffect } from 'react';

import { FormError } from '@/components/forms/form-field';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  BAN_DURATION_LABELS,
  BAN_DURATIONS,
  BAN_REASON_MAX_LENGTH,
  banUserAction,
  type BanDuration,
} from '@/modules/admin/client';
import type { FormState } from '@/shared/types';

const DEFAULT_DURATION: BanDuration = 'forever';

interface BanUserDialogProps {
  user: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Блокировка: причина и срок. Все сессии пользователя завершаются сразу. */
export function BanUserDialog({ user, open, onOpenChange }: BanUserDialogProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(banUserAction, null);
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Заблокировать «{user.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Пользователь будет сразу разлогинен и не сможет войти до окончания срока или
              разблокировки. Задачи, комментарии и участие в пространствах сохранятся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="userId" value={user.id} />

          <div className="grid gap-2">
            <Label htmlFor="ban-duration">Срок</Label>
            <Select name="duration" defaultValue={failure?.values.duration || DEFAULT_DURATION}>
              <SelectTrigger id="ban-duration" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAN_DURATIONS.map((duration) => (
                  <SelectItem key={duration} value={duration}>
                    {BAN_DURATION_LABELS[duration]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ban-reason">Причина (необязательно)</Label>
            <Textarea
              id="ban-reason"
              name="reason"
              rows={3}
              maxLength={BAN_REASON_MAX_LENGTH}
              defaultValue={failure?.values.reason}
              aria-invalid={fieldErrors?.reason ? true : undefined}
              placeholder="Видна только администраторам"
            />
            {fieldErrors?.reason && (
              <p className="text-sm text-destructive">{fieldErrors.reason.join(' ')}</p>
            )}
          </div>

          <FormError message={fieldErrors ? undefined : failure?.error.message} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Подождите…' : 'Заблокировать'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
