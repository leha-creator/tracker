'use client';

import { useActionState } from 'react';

import { FormError, FormField, FormNotice } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { resendVerificationAction, type ResendVerificationState } from '@/modules/auth/client';

/** Повторная отправка письма подтверждения. Ответ одинаковый для любого email. */
export function ResendVerificationForm({
  returnTo,
  defaultEmail,
}: {
  returnTo: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState<ResendVerificationState, FormData>(
    resendVerificationAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormNotice
        message={
          state?.ok
            ? 'Если аккаунт с таким email ждёт подтверждения, мы отправили письмо. Проверьте и папку «Спам».'
            : undefined
        }
      />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        id="resend-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={failure?.values.email ?? defaultEmail}
        errors={fieldErrors?.email}
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? 'Отправляем…' : 'Отправить письмо ещё раз'}
      </Button>
    </form>
  );
}
