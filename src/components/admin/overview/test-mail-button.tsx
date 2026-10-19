'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { sendTestMailAction } from '@/modules/admin/client';
import type { FormState } from '@/shared/types';

/** Тестовое письмо на свой email: проверка SMTP. */
export function TestMailButton() {
  const [state, formAction, pending] = useActionState<FormState<{ to: string }>, FormData>(
    sendTestMailAction,
    null,
  );
  return (
    <form action={formAction} className="grid gap-2">
      <FormError message={state && !state.ok ? state.error.message : undefined} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? 'Отправляем…' : 'Отправить тестовое письмо'}
        </Button>
        {state?.ok && (
          <span role="status" className="text-sm text-muted-foreground">
            Отправлено на {state.data.to}
          </span>
        )}
      </div>
    </form>
  );
}
