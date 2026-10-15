import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BoardColumns } from '@/components/projects/board-columns';
import { listStatuses } from '@/modules/projects';

import { loadProjectPage } from '../_lib/load-project';

export const metadata: Metadata = { title: 'Доска проекта — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/projects/[projectId]/board'>;

export default function ProjectBoardPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
      <BoardSection params={params} />
    </Suspense>
  );
}

async function BoardSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, projectId } = await params;
  const { session, workspace, project } = await loadProjectPage(workspaceSlug, projectId);
  const statuses = await listStatuses(session, workspace.id, project.id);
  return <BoardColumns statuses={statuses} />;
}
