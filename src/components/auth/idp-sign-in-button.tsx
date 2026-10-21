'use client';

import { KeyRound } from 'lucide-react';
import { useActionState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { signInWithIdpAction, type IdpSignInState } from '@/modules/auth/client';

/** «Войти через plwedding ID»: вход или регистрация через единую учётную запись. */
export function IdpSignInButton({
  returnTo,
  error,
}: {
  returnTo: string;
  /** Ошибка из `?error=` после неудачного колбэка IdP. */
  error?: string | null;
}) {
  const [state, formAction, pending] = useActionState<IdpSignInState, FormData>(
    signInWithIdpAction,
    null,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormError message={state?.error.message ?? error ?? undefined} />
      <Button type="submit" disabled={pending}>
        <KeyRound />
        {pending ? 'Переходим в plwedding ID…' : 'Войти через plwedding ID'}
      </Button>
    </form>
  );
}
