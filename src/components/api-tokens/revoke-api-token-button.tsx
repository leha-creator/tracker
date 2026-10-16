'use client';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { revokeAgentTokenAction, revokeApiTokenAction } from '@/modules/api-tokens/client';

/** Чей токен отзывается: свой (профиль) или агента (страница агента, только владелец). */
export type RevokeTarget =
  { kind: 'personal' } | { kind: 'agent'; workspaceId: string; agentId: string };

export function RevokeApiTokenButton({
  token,
  target,
}: {
  token: { id: string; name: string };
  target: RevokeTarget;
}) {
  return (
    <ConfirmActionDialog
      action={target.kind === 'agent' ? revokeAgentTokenAction : revokeApiTokenAction}
      fields={
        target.kind === 'agent'
          ? { tokenId: token.id, workspaceId: target.workspaceId, agentId: target.agentId }
          : { tokenId: token.id }
      }
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
