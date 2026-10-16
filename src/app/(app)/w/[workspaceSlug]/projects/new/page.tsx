import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CreateProjectForm } from '@/components/projects/create-project-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Новый проект — Tasker' };

export default function NewProjectPage({ params }: PageProps<'/w/[workspaceSlug]/projects/new'>) {
  return (
    <Suspense fallback={<div className="h-64 max-w-md animate-pulse rounded-xl bg-muted" />}>
      <NewProjectSection params={params} />
    </Suspense>
  );
}

async function NewProjectSection({
  params,
}: Pick<PageProps<'/w/[workspaceSlug]/projects/new'>, 'params'>) {
  const { workspaceSlug } = await params;
  const { workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  // Без права управления проектами страницы как будто нет; сервер всё равно проверит право.
  if (!access.permissions.manageProjects) notFound();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle role="heading" aria-level={1}>
          Новый проект
        </CardTitle>
        <CardDescription>
          Колонки «К выполнению», «В работе» и «Готово» создадутся сразу — их можно изменить в
          настройках проекта.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateProjectForm workspaceId={workspace.id} />
      </CardContent>
    </Card>
  );
}
