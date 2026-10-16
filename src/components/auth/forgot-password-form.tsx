'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { FormError, FormField, FormNotice } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { forgotPasswordAction } from '@/modules/auth/client';
import type { FormState } from '@/shared/types';

/** «Забыли пароль?»: ответ одинаковый для любого email — так нельзя проверить, есть ли аккаунт. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    forgotPasswordAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="grid gap-4">
        <FormNotice message="Если аккаунт с таким email существует, мы отправили письмо со ссылкой для сброса пароля. Ссылка действует 1 час. Проверьте и папку «Спам»." />
        <Link href="/login" className="text-center text-sm underline underline-offset-4">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  const fieldErrors = state?.error.fieldErrors;
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={fieldErrors ? undefined : state?.error.message} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.values.email}
        errors={fieldErrors?.email}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Отправляем…' : 'Отправить ссылку'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Вспомнили пароль?{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Войти
        </Link>
      </p>
    </form>
  );
}
