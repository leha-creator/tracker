'use client';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { revokeApiTokenAction } from '@/modules/api-tokens/client';

export function RevokeApiTokenButton({ token }: { token: { id: string; name: string } }) {
  return (
    <ConfirmActionDialog
      action={revokeApiTokenAction}
      fields={{ tokenId: token.id }}
      trigger={
        <Button type="button" variant="outline" size="sm">
          Отозвать
        </Button>
      }
      title={`Отозвать токен «${token.name}»?`}
      description="Агенты с этим токеном сразу потеряют доступ. Отменить отзыв нельзя — понадобится новый токен."
      confirmLabel="Отозвать"
    />
  );
}
