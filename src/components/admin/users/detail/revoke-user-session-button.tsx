'use client';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { revokeUserSessionAction } from '@/modules/admin/client';

export function RevokeUserSessionButton({
  userId,
  sessionId,
  label,
}: {
  userId: string;
  sessionId: string;
  label: string;
}) {
  return (
    <ConfirmActionDialog
      action={revokeUserSessionAction}
      fields={{ userId, sessionId }}
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
