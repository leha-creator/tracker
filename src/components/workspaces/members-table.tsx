'use client';

import Link from 'next/link';
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
import { UserAvatar } from '@/components/users/user-avatar';
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
import {
  WORKSPACE_ROLES,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@/shared/access/workspace-role';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { WORKSPACE_ROLE_LABELS } from './role-label';

interface MembersTableProps {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  members: MemberDto[];
  /** Может ли текущий пользователь управлять участниками (UX; сервер проверяет сам). */
  canManage: boolean;
}

export function MembersTable({
  workspaceId,
  workspaceSlug,
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
          <TableHead className="w-32">Документы</TableHead>
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
            workspaceSlug={workspaceSlug}
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
  workspaceSlug,
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
        <div className="flex items-center gap-3">
          <UserAvatar user={member} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/w/${workspaceSlug}/members/${member.userId}`}
              className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {member.name}
            </Link>
            {member.isCurrentUser && <span className="text-muted-foreground"> (вы)</span>}
            {member.isAgent ? (
              <div className="text-sm text-muted-foreground">Агент для Claude Code</div>
            ) : (
              <div className="text-sm break-all text-muted-foreground">{member.email}</div>
            )}
          </div>
        </div>
        {roleError && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {roleError}
          </p>
        )}
      </TableCell>
      <TableCell>
        {member.isAgent ? (
          <Badge variant="outline">Агент</Badge>
        ) : canManage ? (
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
        <MemberPermissionCell
          workspaceId={workspaceId}
          member={member}
          permission="manageProjects"
          canManage={canManage}
        />
      </TableCell>
      <TableCell>
        <MemberPermissionCell
          workspaceId={workspaceId}
          member={member}
          permission="manageDocuments"
          canManage={canManage}
        />
      </TableCell>
      <TableCell className="text-right">
        {member.isAgent ? (
          // Агентом управляют в разделе «Агенты»: права, ответственный, отключение и токены.
          canManage && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/w/${workspaceSlug}/settings/agents`}>Настроить</Link>
            </Button>
          )
        ) : member.isCurrentUser ? (
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

const PERMISSION_LABELS: Record<WorkspacePermission, string> = {
  manageProjects: 'Управление проектами',
  manageDocuments: 'Управление документами',
};

function hasPermissionFlag(member: MemberDto, permission: WorkspacePermission): boolean {
  return permission === 'manageProjects' ? member.canManageProjects : member.canManageDocuments;
}

/**
 * Право участника сверх роли («Управление проектами», «Управление документами»). У владельца
 * оно есть всегда; участнику его выдаёт владелец. Пока запрос идёт — показываем запрошенное
 * значение, после ответа — значение сервера.
 */
function MemberPermissionCell({
  workspaceId,
  member,
  permission,
  canManage,
}: {
  workspaceId: string;
  member: MemberDto;
  permission: WorkspacePermission;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setMemberPermissionAction,
    null,
  );
  const granted = hasPermissionFlag(member, permission);
  const [requested, setRequested] = useState(granted);
  const error = state && !state.ok ? state.error.message : undefined;

  if (member.role === 'owner') {
    return <span className="text-sm text-muted-foreground">Всегда</span>;
  }
  if (!canManage || member.isAgent) {
    return <span className="text-sm text-muted-foreground">{granted ? 'Управляет' : 'Нет'}</span>;
  }

  function toggle(value: boolean) {
    const formData = new FormData();
    formData.set('workspaceId', workspaceId);
    formData.set('memberId', member.id);
    formData.set('permission', permission);
    formData.set('value', String(value));
    setRequested(value);
    startTransition(() => action(formData));
  }

  return (
    <div className="grid gap-1">
      <Switch
        checked={pending ? requested : granted}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label={`${PERMISSION_LABELS[permission]}: ${member.name}`}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
