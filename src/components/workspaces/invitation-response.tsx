'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  acceptInvitationAction,
  rejectInvitationAction,
  type FormState,
} from '@/modules/workspaces/client';

/** Кнопки «Принять» / «Отклонить». Успех завершается редиректом на сервере. */
export function InvitationResponse({ invitationId }: { invitationId: string }) {
  const [acceptState, acceptAction, accepting] = useActionState<FormState, FormData>(
    acceptInvitationAction,
    null,
  );
  const [rejectState, rejectAction, rejecting] = useActionState<FormState, FormData>(
    rejectInvitationAction,
    null,
  );
  const failure = [acceptState, rejectState].find((state) => state && !state.ok);
  const busy = accepting || rejecting;

  return (
    <div className="grid gap-3">
      <FormError message={failure && !failure.ok ? failure.error.message : undefined} />
      <div className="flex flex-wrap gap-2">
        <form action={acceptAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" disabled={busy}>
            {accepting ? 'Принимаем…' : 'Принять приглашение'}
          </Button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" variant="outline" disabled={busy}>
            {rejecting ? 'Отклоняем…' : 'Отклонить'}
          </Button>
        </form>
      </div>
    </div>
  );
}
