'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { signInAction, type AuthFormState } from '@/modules/auth/client';

import { FormError, FormField, FormNotice } from '@/components/forms/form-field';

import { ResendVerificationForm } from './resend-verification-form';

function withReturnTo(path: string, returnTo: string): string {
  return returnTo === '/' ? path : `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function SignInForm({ returnTo, notice }: { returnTo: string; notice?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signInAction, null);
  const fieldErrors = state?.error.fieldErrors;

  return (
    <div className="grid gap-6">
      <form action={formAction} className="grid gap-4" noValidate>
        <input type="hidden" name="returnTo" value={returnTo} />
        <FormNotice message={state ? undefined : notice} />
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
        <div className="grid gap-2">
          <FormField
            name="password"
            label="Пароль"
            type="password"
            autoComplete="current-password"
            required
            errors={fieldErrors?.password}
          />
          <Link
            href="/forgot-password"
            className="justify-self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Забыли пароль?
          </Link>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Нет аккаунта?{' '}
          <Link
            href={withReturnTo('/register', returnTo)}
            className="text-foreground underline underline-offset-4"
          >
            Зарегистрироваться
          </Link>
        </p>
      </form>
      {state?.needsVerification && (
        <section aria-label="Письмо для подтверждения email" className="grid gap-2 border-t pt-6">
          <p className="text-sm text-muted-foreground">
            Письмо не пришло? Отправим ещё раз (ссылка действует 24 часа).
          </p>
          <ResendVerificationForm returnTo={returnTo} defaultEmail={state.values.email} />
        </section>
      )}
    </div>
  );
}
