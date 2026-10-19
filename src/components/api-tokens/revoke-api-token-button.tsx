'use client';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { revokeUserTokenAction } from '@/modules/admin/client';
import { revokeAgentTokenAction, revokeApiTokenAction } from '@/modules/api-tokens/client';

/**
 * Чей токен отзывается: свой (профиль), агента (страница агента, только владелец) или
 * пользователя (карточка в админке).
 */
export type RevokeTarget =
  | { kind: 'personal' }
  | { kind: 'agent'; workspaceId: string; agentId: string }
  | { kind: 'admin'; userId: string };

const ACTIONS = {
  personal: revokeApiTokenAction,
  agent: revokeAgentTokenAction,
  admin: revokeUserTokenAction,
} as const;

function revokeFields(target: RevokeTarget, tokenId: string): Record<string, string> {
  switch (target.kind) {
    case 'agent':
      return { tokenId, workspaceId: target.workspaceId, agentId: target.agentId };
    case 'admin':
      return { tokenId, userId: target.userId };
    case 'personal':
      return { tokenId };
  }
}

export function RevokeApiTokenButton({
  token,
  target,
}: {
  token: { id: string; name: string };
  target: RevokeTarget;
}) {
  return (
    <ConfirmActionDialog
      action={ACTIONS[target.kind]}
      fields={revokeFields(target, token.id)}
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
