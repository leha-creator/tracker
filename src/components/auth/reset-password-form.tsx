'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { PASSWORD_MIN_LENGTH, resetPasswordAction } from '@/modules/auth/client';
import type { FormState } from '@/shared/types';

/** Новый пароль по ссылке из письма. Успех — редирект на вход. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resetPasswordAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={fieldErrors && !fieldErrors.token ? undefined : failure?.error.message} />
      <FormField
        name="password"
        label="Новый пароль"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        errors={fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Повторите пароль"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors?.confirmPassword}
      />
      <p className="text-sm text-muted-foreground">
        Не короче {PASSWORD_MIN_LENGTH} символов. После смены пароля все устройства выйдут из
        аккаунта.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить пароль'}
      </Button>
    </form>
  );
}
