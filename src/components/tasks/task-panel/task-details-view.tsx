import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ViaAgentBadge } from '@/components/agents/via-agent-badge';
import { TaskDocumentsSection } from '@/components/documents/task-documents/task-documents-section';
import { TaskGithubSection } from '@/components/github/task-github-section';
import { LiveRefresh } from '@/components/realtime/use-live-refresh';
import { listProjects, listWorkspaceStatuses } from '@/modules/projects';
import {
  getTaskByNumber,
  listLabels,
  listTaskComments,
  listTaskWatchers,
  type MentionCandidate,
} from '@/modules/tasks';
import { listMembers } from '@/modules/workspaces';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

import { AddToProjectForm } from '../add-to-project-form';
import { TaskAttachmentsSection } from '../attachments/task-attachments-section';
import { TaskHistorySection } from '../history/task-history-section';
import { TaskLabelsEditor } from '../labels/task-labels-editor';
import { TaskWatchButton } from '../watchers/task-watch-button';
import { CommentForm } from '../comments/comment-form';
import { CommentList } from '../comments/comment-list';
import { ParentPicker } from '../subtasks/parent-picker';
import { TaskBreadcrumbs } from '../subtasks/task-breadcrumbs';
import { TaskSubtasksSection } from '../subtasks/task-subtasks-section';
import { TaskDescriptionEditor, TaskPropertiesEditor, TaskTitleEditor } from '../task-details-form';
import { TaskPlacements } from '../task-placements';
import { TaskArchiveBanner } from './task-archive-banner';
import { TaskPanelHotkeys } from './task-panel-hotkeys';
import { TaskPanelNotFound } from './task-panel-not-found';
import { TaskProperty, TaskPropertyList } from './task-property';
import { TaskSaveStatusProvider } from './task-save-status';
import { TaskToolbar, TaskViewActions } from './task-toolbar';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

export interface TaskDetailsViewProps {
  session: AuthSession;
  workspace: { id: string; slug: string };
  taskNumber: number;
  /** В панели поверх доски или списка — или на отдельной странице. */
  variant: 'panel' | 'page';
  /** Закрыть панель / вернуться к списку. */
  closeHref: string;
  /** Адрес возврата после удаления (панель закрывается на той же странице); на странице — нет. */
  returnTo?: string;
  /** Лента целиком (`comments=all`) и адрес, который её включает. */
  allComments: boolean;
  showAllCommentsHref: string;
  /** Вся история изменений (`history=all`) и адрес, который её включает. */
  allHistory: boolean;
  showAllHistoryHref: string;
  /** Полноэкранная страница задачи. */
  pageHref: string;
  /** Адрес другой задачи (подзадачи, родителя): в той же панели или на странице. */
  taskHref: (number: number) => string;
  /** Форма новой подзадачи этой задачи. */
  newSubtaskHref: (parent: number) => string;
}

/**
 * Открытая задача: тулбар, проекты, название, свойства, описание, вложения, лента комментариев
 * и закреплённая внизу форма комментария. Поля сохраняются сами (режим чтения — task-fields.tsx).
 */
export async function TaskDetailsView({
  session,
  workspace,
  taskNumber,
  variant,
  closeHref,
  returnTo,
  allComments,
  showAllCommentsHref,
  allHistory,
  showAllHistoryHref,
  pageHref,
  taskHref,
  newSubtaskHref,
}: TaskDetailsViewProps) {
  const task = await getTaskByNumber(session, workspace.id, taskNumber).catch((error: unknown) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });
  if (!task) {
    if (variant === 'page') notFound();
    return <TaskPanelNotFound closeHref={closeHref} />;
  }

  const [members, projects, statusesByProject, labels, watchers] = await Promise.all([
    listMembers(session, workspace.id),
    listProjects(session, workspace.id),
    listWorkspaceStatuses(session, workspace.id),
    listLabels(session, workspace.id),
    listTaskWatchers(session, workspace.id, task.id),
  ]);
  const mentionCandidates = members.map(({ userId, name, email, image }) => ({
    userId,
    name,
    email,
    image,
  }));
  const placedIds = new Set(task.placements.map((placement) => placement.projectId));
  const freeProjects = projects.filter((project) => !placedIds.has(project.id));
  // На странице задача — заголовок страницы, в панели — раздел поверх доски или списка.
  const Heading = variant === 'page' ? 'h1' : 'h2';
  const actionFields = { workspaceId: workspace.id, taskId: task.id };
  const deleteFields: Record<string, string> = { ...actionFields };
  if (returnTo) deleteFields.returnTo = returnTo;
  const archived = task.archivedAt !== null;

  return (
    // key: другая задача — новые поля с её значениями (поля не пересоздаются после сохранения).
    <TaskSaveStatusProvider key={task.id}>
      {/* Правки других участников, комментарии и файлы этой задачи. */}
      <LiveRefresh taskId={task.id} />
      <article aria-labelledby="task-heading" className="flex min-h-full flex-col">
        {/* useSearchParams внутри — под своей границей Suspense. */}
        <Suspense fallback={null}>
          <TaskPanelHotkeys taskNumber={task.number} variant={variant} readOnly={archived} />
        </Suspense>
        <TaskToolbar
          sticky={variant === 'panel'}
          start={
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{task.key}</span>
          }
        >
          <TaskWatchButton
            workspaceId={workspace.id}
            taskId={task.id}
            currentUser={{
              userId: session.user.id,
              name: session.user.name,
              image: session.user.image,
            }}
            initial={watchers}
          />
          <TaskViewActions
            variant={variant}
            pageHref={pageHref}
            closeHref={closeHref}
            taskKey={task.key}
            archived={archived}
            descendantCount={task.descendantCount}
            actionFields={actionFields}
          />
        </TaskToolbar>

        {task.archivedAt && (
          <TaskArchiveBanner
            taskKey={task.key}
            archivedAt={task.archivedAt}
            archivedByName={task.archivedBy?.name ?? null}
            canDeletePermanently={task.canDeletePermanently}
            descendantCount={task.descendantCount}
            fields={deleteFields}
          />
        )}

        {/* Архивная задача — только для чтения: fieldset выключает все поля и кнопки внутри,
            ссылки (проекты, подзадачи, файлы) работают. */}
        <fieldset
          disabled={archived}
          aria-label={archived ? 'Задача в архиве, только чтение' : undefined}
          className="@container grid min-w-0 flex-1 content-start gap-6 px-4 py-5 sm:px-6"
        >
          <header className="grid gap-1">
            {/* Видимое название — поле ввода; заголовок документа — для навигации скринридером. */}
            <Heading id="task-heading" className="sr-only">
              {task.key} {task.title}
            </Heading>
            <TaskBreadcrumbs ancestors={task.ancestors} taskHref={taskHref} />
            {task.placements.length > 0 && (
              <p className="flex flex-wrap gap-x-1.5 text-sm text-muted-foreground">
                {task.placements.map((placement, index) => (
                  <span key={placement.projectId} className="inline-flex gap-1.5">
                    {index > 0 && <span aria-hidden>·</span>}
                    <Link
                      href={`/w/${workspace.slug}/projects/${placement.projectId}/board`}
                      className="rounded-sm transition-colors hover:text-foreground"
                    >
                      {placement.projectName}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <TaskTitleEditor workspaceId={workspace.id} task={task} />
            <p className="text-xs text-muted-foreground">
              {task.createdBy ? `${task.createdBy.name} · ` : ''}
              {task.createdVia && (
                <>
                  <ViaAgentBadge via={task.createdVia} className="px-1 py-0" />{' '}
                </>
              )}
              создана {DATE_TIME.format(task.createdAt)} · изменена{' '}
              {DATE_TIME.format(task.updatedAt)}
            </p>
          </header>

          <TaskPropertyList>
            <TaskPropertiesEditor
              workspaceId={workspace.id}
              task={task}
              members={members.map(({ userId, name, image }) => ({ userId, name, image }))}
              currentUserId={session.user.id}
              readOnly={archived}
            />
            <TaskProperty label="Проекты" align="start">
              <div className="grid min-w-0 flex-1 justify-items-start">
                <TaskPlacements
                  workspaceId={workspace.id}
                  workspaceSlug={workspace.slug}
                  taskId={task.id}
                  placements={task.placements}
                  statusesByProject={statusesByProject}
                />
                <AddToProjectForm
                  // Новый набор свободных проектов (после добавления) — форма снова свёрнута.
                  key={freeProjects.map((project) => project.id).join()}
                  workspaceId={workspace.id}
                  taskId={task.id}
                  projects={freeProjects.map(({ id, name }) => ({ id, name }))}
                  statusesByProject={statusesByProject}
                />
              </div>
            </TaskProperty>
            <TaskProperty labelId="task-labels-label" label="Метки">
              <TaskLabelsEditor
                workspaceId={workspace.id}
                taskId={task.id}
                value={task.labels}
                options={labels.map(({ id, name, color }) => ({ id, name, color }))}
                labelledBy="task-labels-label"
              />
            </TaskProperty>
            <TaskProperty labelId="task-parent-label" label="Родитель">
              <ParentPicker
                // Другой родитель после сохранения — свежий поиск.
                key={task.ancestors.at(-1)?.number ?? 'none'}
                workspaceId={workspace.id}
                taskId={task.id}
                parent={task.ancestors.at(-1) ?? null}
                labelledBy="task-parent-label"
              />
            </TaskProperty>
          </TaskPropertyList>

          <section aria-labelledby="task-description-heading" className="grid gap-1.5">
            <h3 id="task-description-heading" className="text-sm font-semibold">
              Описание
            </h3>
            <TaskDescriptionEditor
              workspaceId={workspace.id}
              task={task}
              labelledBy="task-description-heading"
            />
          </section>

          <section aria-labelledby="task-subtasks-heading" className="grid gap-2">
            <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-muted" />}>
              <TaskSubtasksSection
                session={session}
                workspaceId={workspace.id}
                task={task}
                taskHref={taskHref}
                newSubtaskHref={newSubtaskHref(task.number)}
                projects={projects.map(({ id, name }) => ({ id, name }))}
                statusesByProject={statusesByProject}
              />
            </Suspense>
          </section>

          <section aria-labelledby="task-attachments-heading" className="grid gap-3">
            <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
              <TaskAttachmentsSection
                session={session}
                workspaceId={workspace.id}
                taskId={task.id}
              />
            </Suspense>
          </section>

          <section aria-labelledby="task-documents-heading" className="grid gap-3">
            <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-muted" />}>
              <TaskDocumentsSection
                session={session}
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                taskId={task.id}
              />
            </Suspense>
          </section>

          <Suspense fallback={null}>
            <TaskGithubSection
              session={session}
              workspace={{ id: workspace.id }}
              task={{ id: task.id, key: task.key, title: task.title }}
            />
          </Suspense>

          <Suspense fallback={<div className="h-5 w-32 animate-pulse rounded-md bg-muted" />}>
            <TaskHistorySection
              session={session}
              workspaceId={workspace.id}
              taskId={task.id}
              all={allHistory}
              showAllHref={showAllHistoryHref}
            />
          </Suspense>

          <section aria-labelledby="task-comments-heading" className="grid gap-3 border-t pt-5">
            <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-muted" />}>
              <TaskComments
                session={session}
                workspaceId={workspace.id}
                taskId={task.id}
                all={allComments}
                showAllHref={showAllCommentsHref}
                members={mentionCandidates}
              />
            </Suspense>
          </section>
        </fieldset>

        {!archived && (
          <div className="sticky bottom-0 z-10 border-t bg-background px-4 py-3 sm:px-6">
            <CommentForm
              docked
              workspaceId={workspace.id}
              taskId={task.id}
              members={mentionCandidates}
            />
          </div>
        )}
      </article>
    </TaskSaveStatusProvider>
  );
}

async function TaskComments({
  session,
  workspaceId,
  taskId,
  all,
  showAllHref,
  members,
}: {
  session: AuthSession;
  workspaceId: string;
  taskId: string;
  all: boolean;
  showAllHref: string;
  members: MentionCandidate[];
}) {
  const comments = await listTaskComments(session, workspaceId, taskId, { all });
  return (
    <>
      <h3 id="task-comments-heading" className="text-sm font-semibold">
        Комментарии{comments.total > 0 && ` (${comments.total})`}
      </h3>
      <CommentList
        workspaceId={workspaceId}
        taskId={taskId}
        comments={comments}
        showAllHref={showAllHref}
        members={members}
      />
    </>
  );
}
