import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LabelsManager } from '@/components/tasks/labels/labels-manager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listLabels, TASK_LABELS_PER_WORKSPACE } from '@/modules/tasks';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Метки задач — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/settings/labels'>;

export default function WorkspaceLabelsPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <LabelsSection params={params} />
    </Suspense>
  );
}

async function LabelsSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  // Видят все участники; правка и удаление — с правом «Управление проектами».
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const labels = await listLabels(session, workspace.id);
  const canManage = access.permissions.manageProjects;

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        {access.role === 'owner' && (
          <Link
            href={`/w/${workspace.slug}/settings`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Настройки пространства
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">Метки задач</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Метки пространства</CardTitle>
          <CardDescription>
            Метки общие для всех проектов: по ним фильтруется список задач, на доске они видны на
            карточках. Не больше {TASK_LABELS_PER_WORKSPACE} меток.
            {!canManage &&
              ' Изменять и удалять метки могут участники с правом управления проектами.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LabelsManager workspaceId={workspace.id} labels={labels} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}
