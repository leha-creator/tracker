import type { Metadata } from 'next';
import { Suspense } from 'react';

import { KanbanBoard } from '@/components/tasks/kanban-board';
import { listStatuses } from '@/modules/projects';
import { getBoardCards } from '@/modules/tasks';

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
  // Колонки — из модуля projects, карточки — из tasks: модули друг о друге не знают.
  const [statuses, cards] = await Promise.all([
    listStatuses(session, workspace.id, project.id),
    getBoardCards(session, workspace.id, project.id),
  ]);
  return (
    <KanbanBoard
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      projectId={project.id}
      statuses={statuses}
      cards={cards}
    />
  );
}
