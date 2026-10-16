'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { verifyTwoFactorSignInAction } from '@/modules/auth/client';
import type { FormState } from '@/shared/types';

type Method = 'totp' | 'backup';

/** Второй шаг входа: код из приложения или резервный код. */
export function TwoFactorSignInForm({ returnTo }: { returnTo: string }) {
  const [method, setMethod] = useState<Method>('totp');
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    verifyTwoFactorSignInAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const expired = failure?.error.code === 'UNAUTHORIZED';

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="method" value={method} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      {expired && (
        <Link href="/login" className="text-sm underline underline-offset-4">
          Вернуться ко входу
        </Link>
      )}
      {method === 'totp' ? (
        <FormField
          key="totp"
          name="code"
          label="Код из приложения"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          maxLength={9}
          autoFocus
          required
          errors={fieldErrors?.code}
        />
      ) : (
        <FormField
          key="backup"
          name="code"
          label="Резервный код"
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxxx-xxxxx"
          autoFocus
          required
          errors={fieldErrors?.code}
        />
      )}
      <div className="flex items-center gap-2">
        <Checkbox id="trustDevice" name="trustDevice" />
        <Label htmlFor="trustDevice" className="font-normal">
          Доверять этому устройству 30 дней
        </Label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Проверяем…' : 'Войти'}
      </Button>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-muted-foreground"
        onClick={() => setMethod(method === 'totp' ? 'backup' : 'totp')}
      >
        {method === 'totp'
          ? 'Нет доступа к приложению? Ввести резервный код'
          : 'Ввести код из приложения'}
      </Button>
    </form>
  );
}
