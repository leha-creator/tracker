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
    <Suspense fallback={<BoardSkeleton />}>
      <BoardSection params={params} />
    </Suspense>
  );
}

const SKELETON_CARDS = [3, 2, 1];

/** Заглушка в форме доски: колонки с карточками. data-board — та же высота, что у доски. */
function BoardSkeleton() {
  return (
    <div data-board aria-hidden className="-mx-4 overflow-hidden px-4 sm:-mx-6 sm:px-6">
      <div className="flex items-start gap-3">
        {SKELETON_CARDS.map((count, column) => (
          <div key={column} className="grid w-72 shrink-0 gap-2 rounded-xl bg-muted/70 p-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/15" />
            {Array.from({ length: count }, (_, card) => (
              <div key={card} className="h-20 animate-pulse rounded-lg bg-card shadow-card" />
            ))}
          </div>
        ))}
      </div>
    </div>
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
