import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteWorkspaceDialog } from '@/components/workspaces/delete-workspace-dialog';
import { RenameWorkspaceForm } from '@/components/workspaces/rename-workspace-form';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Настройки пространства — Tasker' };

export default function WorkspaceSettingsPage({
  params,
}: PageProps<'/w/[workspaceSlug]/settings'>) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <SettingsSection params={params} />
    </Suspense>
  );
}

async function SettingsSection({
  params,
}: Pick<PageProps<'/w/[workspaceSlug]/settings'>, 'params'>) {
  const { workspaceSlug } = await params;
  // Только владелец; остальным — 404.
  const { workspace } = await requireWorkspaceAccessBySlug(workspaceSlug, 'owner');

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки пространства</h1>
      <Card>
        <CardHeader>
          <CardTitle>Основное</CardTitle>
          <CardDescription>Адрес пространства: /w/{workspace.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <RenameWorkspaceForm workspaceId={workspace.id} name={workspace.name} />
        </CardContent>
      </Card>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Опасная зона</CardTitle>
          <CardDescription>
            Удаление пространства нельзя отменить: вместе с ним удаляются участники и приглашения.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteWorkspaceDialog workspaceId={workspace.id} name={workspace.name} />
        </CardContent>
      </Card>
    </div>
  );
}
