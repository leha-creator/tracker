'use client';

import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { changePasswordAction, PASSWORD_MIN_LENGTH } from '@/modules/auth/client';
import type { FormState } from '@/shared/types';

/** Смена пароля: другие устройства выходят из аккаунта, на почту приходит уведомление. */
export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    toast.success('Пароль изменён. Другие устройства вышли из аккаунта.');
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid max-w-sm gap-4" noValidate>
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="currentPassword"
        label="Текущий пароль"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors?.currentPassword}
      />
      <FormField
        name="newPassword"
        label="Новый пароль"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        errors={fieldErrors?.newPassword}
      />
      <FormField
        name="confirmPassword"
        label="Повторите новый пароль"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors?.confirmPassword}
      />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? 'Сохраняем…' : 'Сменить пароль'}
      </Button>
    </form>
  );
}
