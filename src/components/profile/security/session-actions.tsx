'use client';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/modules/auth/client';

export function RevokeSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  return (
    <ConfirmActionDialog
      action={revokeSessionAction}
      fields={{ sessionId }}
      trigger={
        <Button type="button" variant="outline" size="sm">
          Завершить
        </Button>
      }
      title="Завершить сессию?"
      description={`Устройство «${label}» выйдет из аккаунта (в течение 5 минут).`}
      confirmLabel="Завершить"
    />
  );
}

export function RevokeOtherSessionsButton() {
  return (
    <ConfirmActionDialog
      action={revokeOtherSessionsAction}
      fields={{}}
      trigger={
        <Button type="button" variant="outline" size="sm" className="justify-self-start">
          Завершить все, кроме этой
        </Button>
      }
      title="Завершить все другие сессии?"
      description="Все устройства, кроме этого, выйдут из аккаунта (в течение 5 минут)."
      confirmLabel="Завершить"
    />
  );
}
