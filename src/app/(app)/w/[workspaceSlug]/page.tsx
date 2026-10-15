import { Suspense } from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export default function WorkspacePage({ params }: PageProps<'/w/[workspaceSlug]'>) {
  return (
    <Suspense fallback={<div className="h-28 animate-pulse rounded-xl bg-muted" />}>
      <WorkspaceOverview params={params} />
    </Suspense>
  );
}

async function WorkspaceOverview({ params }: Pick<PageProps<'/w/[workspaceSlug]'>, 'params'>) {
  const { workspaceSlug } = await params;
  await requireWorkspaceAccessBySlug(workspaceSlug);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Проекты</CardTitle>
        <CardDescription>
          Проекты, статусы и задачи пространства появятся на следующих этапах.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
