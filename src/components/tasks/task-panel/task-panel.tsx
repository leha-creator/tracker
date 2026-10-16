import { Suspense } from 'react';

import { requireWorkspaceAccessBySlug } from '@/shared/access';

import { TaskCreateView } from './task-create-view';
import { TaskDetailsView } from './task-details-view';
import { TaskPanelFrame, TaskPanelSkeleton } from './task-panel-frame';
import {
  parseTaskPanelParam,
  TASK_COMMENTS_PARAM,
  TASK_PANEL_PARAM,
  taskPageHref,
  taskPanelHref,
  withSearchParam,
  type TaskPanelState,
} from './task-panel-href';

type RawSearchParams = Record<string, string | string[] | undefined>;

interface TaskPanelProps {
  workspaceSlug: string;
  searchParams: Promise<RawSearchParams>;
  /** Путь страницы под панелью (доска, список). */
  basePath: string;
  /** Проект, выбранный заранее в форме создания. */
  defaultProjectId?: string;
}

/**
 * Панель задачи по `?task=<номер>` или `?task=new`. Без параметра — ничего. Своя граница
 * Suspense: доска и список не ждут панель.
 */
export function TaskPanel(props: TaskPanelProps) {
  return (
    <Suspense fallback={null}>
      <TaskPanelSlot {...props} />
    </Suspense>
  );
}

async function TaskPanelSlot({
  workspaceSlug,
  searchParams,
  basePath,
  defaultProjectId,
}: TaskPanelProps) {
  const raw = await searchParams;
  const state = parseTaskPanelParam(raw[TASK_PANEL_PARAM]);
  if (state.mode === 'closed') return null;

  const closeHref = taskPanelHref(basePath, raw, null);
  const isNew = state.mode === 'new';
  return (
    <TaskPanelFrame
      closeHref={closeHref}
      label={isNew ? 'Новая задача' : `Задача #${state.number}`}
      focusKey={isNew ? 'new' : String(state.number)}
      focusPanel={!isNew}
    >
      <Suspense fallback={<TaskPanelSkeleton />}>
        <TaskPanelContent
          workspaceSlug={workspaceSlug}
          state={state}
          raw={raw}
          basePath={basePath}
          closeHref={closeHref}
          defaultProjectId={defaultProjectId}
        />
      </Suspense>
    </TaskPanelFrame>
  );
}

async function TaskPanelContent({
  workspaceSlug,
  state,
  raw,
  basePath,
  closeHref,
  defaultProjectId,
}: {
  workspaceSlug: string;
  state: Exclude<TaskPanelState, { mode: 'closed' }>;
  raw: RawSearchParams;
  basePath: string;
  closeHref: string;
  defaultProjectId?: string;
}) {
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);

  // После создания и удаления — обратно на эту страницу (адрес проверяет сервер).
  if (state.mode === 'new') {
    return (
      <TaskCreateView
        session={session}
        workspaceId={workspace.id}
        variant="panel"
        closeHref={closeHref}
        returnTo={closeHref}
        defaultProjectId={defaultProjectId}
      />
    );
  }

  const comments = raw[TASK_COMMENTS_PARAM];
  return (
    <TaskDetailsView
      session={session}
      workspace={workspace}
      taskNumber={state.number}
      variant="panel"
      closeHref={closeHref}
      returnTo={closeHref}
      allComments={(Array.isArray(comments) ? comments[0] : comments) === 'all'}
      showAllCommentsHref={withSearchParam(basePath, raw, TASK_COMMENTS_PARAM, 'all')}
      pageHref={taskPageHref(workspace.slug, state.number)}
    />
  );
}
