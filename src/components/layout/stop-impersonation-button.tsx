'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { stopImpersonationAction } from '@/modules/admin/client';
import type { FormState } from '@/shared/types';

/** «Вернуться к своей учётной записи»: успех — переход на карточку пользователя в админке. */
export function StopImpersonationButton() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    () => stopImpersonationAction(),
    null,
  );
  const failure = state && !state.ok ? state : null;
  return (
    <form action={formAction} className="flex items-center gap-2">
      {failure && <span className="text-xs text-destructive">{failure.error.message}</span>}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        className="bg-background"
      >
        {pending ? 'Подождите…' : 'Вернуться к своей учётной записи'}
      </Button>
    </form>
  );
}
