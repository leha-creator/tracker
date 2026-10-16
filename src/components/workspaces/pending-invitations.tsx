'use client';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cancelInvitationAction, type PendingInvitationDto } from '@/modules/workspaces/client';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { CopyLinkButton } from './copy-link-button';
import { WORKSPACE_ROLE_LABELS } from './role-label';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });

export function PendingInvitations({
  workspaceId,
  invitations,
}: {
  workspaceId: string;
  invitations: PendingInvitationDto[];
}) {
  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет ожидающих приглашений.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Роль</TableHead>
          <TableHead>Действует до</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Действия</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell>
              <div>{invitation.email}</div>
              <div className="text-sm text-muted-foreground">
                пригласил(а) {invitation.inviterName}
              </div>
            </TableCell>
            <TableCell>{WORKSPACE_ROLE_LABELS[invitation.role]}</TableCell>
            <TableCell>{dateFormat.format(invitation.expiresAt)}</TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <CopyLinkButton url={invitation.inviteUrl} label="Ссылка" />
                <ConfirmActionDialog
                  action={cancelInvitationAction}
                  fields={{ workspaceId, invitationId: invitation.id }}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Отменить
                    </Button>
                  }
                  title="Отменить приглашение?"
                  description={`Ссылка для ${invitation.email} перестанет работать.`}
                  confirmLabel="Отменить приглашение"
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
