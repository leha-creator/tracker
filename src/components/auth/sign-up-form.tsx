'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { PASSWORD_MIN_LENGTH, signUpAction, type AuthFormState } from '@/modules/auth/client';

import { FormError, FormField } from '@/components/forms/form-field';

export function SignUpForm({
  returnTo,
  emailVerification,
}: {
  returnTo: string;
  /** Регистрация требует подтверждения email по письму. */
  emailVerification: boolean;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpAction, null);
  const fieldErrors = state?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormError message={fieldErrors ? undefined : state?.error.message} />
      <FormField
        name="name"
        label="Имя"
        autoComplete="name"
        required
        defaultValue={state?.values.name}
        errors={fieldErrors?.name}
      />
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
        label={`Пароль (не короче ${PASSWORD_MIN_LENGTH} символов)`}
        type="password"
        autoComplete="new-password"
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
      {emailVerification && (
        <p className="text-sm text-muted-foreground">
          После регистрации придёт письмо: подтвердите email по ссылке, чтобы войти.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{' '}
        <Link
          href={returnTo === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="text-foreground underline underline-offset-4"
        >
          Войти
        </Link>
      </p>
    </form>
  );
}
