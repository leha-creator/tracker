'use client';

import { useActionState, useState, useTransition } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  linkGithubAccountAction,
  unlinkGithubAccountAction,
} from '@/modules/integrations/github/client';

/** «Привязать GitHub»: уводит на авторизацию GitHub. */
export function LinkGithubButton() {
  const [state, formAction, pending] = useActionState(linkGithubAccountAction, null);
  return (
    <form action={formAction} className="grid gap-2">
      <FormError message={state?.error.message} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? 'Переходим на GitHub…' : 'Привязать GitHub'}
        </Button>
      </div>
    </form>
  );
}

/** «Отвязать»: ошибка (единственный способ входа) показывается рядом. */
export function UnlinkGithubButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <FormError message={error ?? undefined} />
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await unlinkGithubAccountAction();
              setError(result.ok ? null : result.error.message);
            })
          }
        >
          {pending ? 'Отвязываем…' : 'Отвязать'}
        </Button>
      </div>
    </div>
  );
}
