import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteMemberForm } from '@/components/workspaces/invite-member-form';
import { MembersTable } from '@/components/workspaces/members-table';
import { PendingInvitations } from '@/components/workspaces/pending-invitations';
import { listInvitations, listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Участники — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/settings/members'>;

export default function WorkspaceMembersPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <MembersSection params={params} />
    </Suspense>
  );
}

async function MembersSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const isOwner = access.role === 'owner';
  const [members, invitations] = await Promise.all([
    listMembers(session, workspace.id),
    isOwner ? listInvitations(session, workspace.id) : Promise.resolve([]),
  ]);

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Участники</h1>
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Пригласить участника</CardTitle>
            <CardDescription>
              Мы отправим письмо со ссылкой. Принять приглашение сможет только пользователь с этим
              email; ссылка действует 7 дней.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm workspaceId={workspace.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Участники</CardTitle>
          <CardDescription>
            {isOwner
              ? 'Владельцы управляют участниками и приглашениями. В пространстве всегда остаётся хотя бы один владелец. Переключатель «Проекты» разрешает участнику создавать проекты и настраивать статусы.'
              : 'Управлять участниками могут владельцы пространства.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersTable
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            workspaceName={workspace.name}
            members={members}
            canManage={isOwner}
          />
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Ожидающие приглашения</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingInvitations workspaceId={workspace.id} invitations={invitations} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
