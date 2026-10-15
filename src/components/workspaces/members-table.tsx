'use client';

import { startTransition, useActionState, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  changeMemberRoleAction,
  leaveWorkspaceAction,
  removeMemberAction,
  setMemberPermissionAction,
  type FormState,
  type MemberDto,
} from '@/modules/workspaces/client';
import { WORKSPACE_ROLES, type WorkspaceRole } from '@/shared/access/workspace-role';

import { ConfirmActionDialog } from './confirm-action-dialog';
import { WORKSPACE_ROLE_LABELS } from './role-label';

interface MembersTableProps {
  workspaceId: string;
  workspaceName: string;
  members: MemberDto[];
  /** Может ли текущий пользователь управлять участниками (UX; сервер проверяет сам). */
  canManage: boolean;
}

export function MembersTable({
  workspaceId,
  workspaceName,
  members,
  canManage,
}: MembersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Участник</TableHead>
          <TableHead className="w-40">Роль</TableHead>
          <TableHead className="w-32">Проекты</TableHead>
          <TableHead className="w-44 text-right">
            <span className="sr-only">Действия</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            member={member}
            canManage={canManage}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function MemberRow({
  workspaceId,
  workspaceName,
  member,
  canManage,
}: Omit<MembersTableProps, 'members'> & { member: MemberDto }) {
  const [roleState, roleAction, rolePending] = useActionState<FormState, FormData>(
    changeMemberRoleAction,
    null,
  );
  const [requestedRole, setRequestedRole] = useState<WorkspaceRole>(member.role);
  const roleError = roleState && !roleState.ok ? roleState.error.message : undefined;

  // Пока запрос идёт — показываем выбранную роль; после ответа — роль из данных сервера
  // (при отказе, например для последнего владельца, select вернётся к прежнему значению).
  function changeRole(role: string) {
    const formData = new FormData();
    formData.set('workspaceId', workspaceId);
    formData.set('memberId', member.id);
    formData.set('role', role);
    setRequestedRole(role as WorkspaceRole);
    startTransition(() => roleAction(formData));
  }

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="font-medium">
          {member.name}
          {member.isCurrentUser && <span className="text-muted-foreground"> (вы)</span>}
        </div>
        <div className="text-sm text-muted-foreground">{member.email}</div>
        {roleError && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {roleError}
          </p>
        )}
      </TableCell>
      <TableCell>
        {canManage ? (
          <Select
            value={rolePending ? requestedRole : member.role}
            disabled={rolePending}
            onValueChange={changeRole}
          >
            <SelectTrigger size="sm" aria-label={`Роль: ${member.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKSPACE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {WORKSPACE_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
            {WORKSPACE_ROLE_LABELS[member.role]}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <ProjectsPermissionCell workspaceId={workspaceId} member={member} canManage={canManage} />
      </TableCell>
      <TableCell className="text-right">
        {member.isCurrentUser ? (
          <ConfirmActionDialog
            action={leaveWorkspaceAction}
            fields={{ workspaceId }}
            trigger={
              <Button variant="ghost" size="sm">
                Покинуть
              </Button>
            }
            title={`Покинуть «${workspaceName}»?`}
            description="Вы потеряете доступ к пространству. Вернуться можно только по новому приглашению."
            confirmLabel="Покинуть"
          />
        ) : (
          canManage && (
            <ConfirmActionDialog
              action={removeMemberAction}
              fields={{ workspaceId, memberId: member.id }}
              trigger={
                <Button variant="ghost" size="sm">
                  Исключить
                </Button>
              }
              title={`Исключить ${member.name}?`}
              description="Участник потеряет доступ к пространству. Вернуть его можно новым приглашением."
              confirmLabel="Исключить"
            />
          )
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Право «Управление проектами». У владельца оно есть всегда; участнику его выдаёт владелец.
 * Пока запрос идёт — показываем запрошенное значение, после ответа — значение сервера.
 */
function ProjectsPermissionCell({
  workspaceId,
  member,
  canManage,
}: {
  workspaceId: string;
  member: MemberDto;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setMemberPermissionAction,
    null,
  );
  const [requested, setRequested] = useState(member.canManageProjects);
  const error = state && !state.ok ? state.error.message : undefined;

  if (member.role === 'owner') {
    return <span className="text-sm text-muted-foreground">Всегда</span>;
  }
  if (!canManage) {
    return (
      <span className="text-sm text-muted-foreground">
        {member.canManageProjects ? 'Управляет' : 'Нет'}
      </span>
    );
  }

  function toggle(value: boolean) {
    const formData = new FormData();
    formData.set('workspaceId', workspaceId);
    formData.set('memberId', member.id);
    formData.set('permission', 'manageProjects');
    formData.set('value', String(value));
    setRequested(value);
    startTransition(() => action(formData));
  }

  return (
    <div className="grid gap-1">
      <Switch
        checked={pending ? requested : member.canManageProjects}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label={`Управление проектами: ${member.name}`}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
