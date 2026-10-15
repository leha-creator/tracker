'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { signInAction, type AuthFormState } from '@/modules/auth';

import { FormError, FormField } from './form-field';

export function SignInForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signInAction, null);
  const fieldErrors = state?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />
      {/* Сообщение показываем, только если ошибка не привязана к полям. */}
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
      <FormField
        name="password"
        label="Пароль"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Нет аккаунта?{' '}
        <Link
          href={
            returnTo === '/' ? '/register' : `/register?returnTo=${encodeURIComponent(returnTo)}`
          }
          className="text-foreground underline underline-offset-4"
        >
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}
