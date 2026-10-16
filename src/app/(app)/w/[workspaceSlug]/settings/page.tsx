import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteWorkspaceDialog } from '@/components/workspaces/delete-workspace-dialog';
import { RenameWorkspaceForm } from '@/components/workspaces/rename-workspace-form';
import { TaskKeyForm } from '@/components/workspaces/task-key-form';
import { isGithubEnabled } from '@/modules/integrations/github';
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
  const githubEnabled = await isGithubEnabled();

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки пространства</h1>
      <Card>
        <CardHeader>
          <CardTitle>Основное</CardTitle>
          <CardDescription>Адрес пространства: /w/{workspace.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <RenameWorkspaceForm
            workspaceId={workspace.id}
            name={workspace.name}
            icon={workspace.icon}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ключ задач</CardTitle>
          <CardDescription>
            Префикс номеров задач. По нему ветки, PR и коммиты GitHub привязываются к задачам.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskKeyForm workspaceId={workspace.id} taskKey={workspace.taskKey} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Агенты</CardTitle>
          <CardDescription>
            Отдельные участники для Claude Code: свои токены, права и ответственный.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/w/${workspace.slug}/settings/agents`}
            className="text-sm text-primary hover:underline"
          >
            Настроить агентов
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Интеграция с GitHub</CardTitle>
          <CardDescription>
            Подключите свои репозитории: PR, ветки и коммиты привязываются к задачам по ключу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/w/${workspace.slug}/settings/github`}
            className="text-sm text-primary hover:underline"
          >
            {githubEnabled ? 'Подключить репозитории' : 'Подробнее'}
          </Link>
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
