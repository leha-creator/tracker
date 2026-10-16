import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { TaskAttachmentsSection } from '@/components/tasks/attachments/task-attachments-section';
import { CommentForm } from '@/components/tasks/comments/comment-form';
import { CommentList } from '@/components/tasks/comments/comment-list';
import { AddToProjectForm } from '@/components/tasks/add-to-project-form';
import { TaskDetailsForm } from '@/components/tasks/task-details-form';
import { TaskPlacements } from '@/components/tasks/task-placements';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { listProjects, listWorkspaceStatuses } from '@/modules/projects';
import {
  deleteTaskAction,
  getTaskByNumber,
  listTaskComments,
  taskNumberSchema,
} from '@/modules/tasks';
import { listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Задача — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks/[taskNumber]'>;

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

export default function TaskPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <TaskSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

interface TaskCommentsSectionProps {
  session: AuthSession;
  workspaceId: string;
  taskId: string;
  taskHref: string;
  searchParams: Props['searchParams'];
}

async function TaskCommentsSection({
  session,
  workspaceId,
  taskId,
  taskHref,
  searchParams,
}: TaskCommentsSectionProps) {
  const { comments: mode } = await searchParams;
  const comments = await listTaskComments(session, workspaceId, taskId, { all: mode === 'all' });
  return (
    <>
      <h3 id="task-comments-heading" className="font-medium">
        Комментарии{comments.total > 0 && ` (${comments.total})`}
      </h3>
      <CommentList
        workspaceId={workspaceId}
        taskId={taskId}
        comments={comments}
        taskHref={taskHref}
      />
      <CommentForm workspaceId={workspaceId} taskId={taskId} />
    </>
  );
}

async function TaskSection({ params, searchParams }: Props) {
  const { workspaceSlug, taskNumber } = await params;
  const parsed = taskNumberSchema.safeParse(taskNumber);
  if (!parsed.success) notFound();

  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const task = await getTaskByNumber(session, workspace.id, parsed.data).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [members, projects, statusesByProject] = await Promise.all([
    listMembers(session, workspace.id),
    listProjects(session, workspace.id),
    listWorkspaceStatuses(session, workspace.id),
  ]);
  const placedIds = new Set(task.placements.map((placement) => placement.projectId));
  const freeProjects = projects.filter((project) => !placedIds.has(project.id));

  return (
    <article className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            <Link href={`/w/${workspace.slug}/tasks`} className="hover:underline">
              Задачи
            </Link>{' '}
            / <span className="tabular-nums">{task.key}</span>
          </p>
          <h2 className="text-xl font-semibold break-words">{task.title}</h2>
          <p className="text-xs text-muted-foreground">
            {task.createdBy ? `Автор: ${task.createdBy.name} · ` : ''}
            создана {DATE_TIME.format(task.createdAt)} · изменена {DATE_TIME.format(task.updatedAt)}
          </p>
        </div>
        {task.canDelete && (
          <ConfirmActionDialog
            action={deleteTaskAction}
            fields={{ workspaceId: workspace.id, taskId: task.id }}
            trigger={
              <Button type="button" variant="outline" size="sm">
                Удалить задачу
              </Button>
            }
            title={`Удалить задачу ${task.key}?`}
            description="Задача исчезнет со всех досок вместе с комментариями и файлами. Действие нельзя отменить."
            confirmLabel="Удалить"
          />
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="task-fields-heading" className="grid content-start gap-3">
          <h3 id="task-fields-heading" className="sr-only">
            Поля задачи
          </h3>
          <TaskDetailsForm
            workspaceId={workspace.id}
            task={task}
            members={members.map((member) => ({ userId: member.userId, name: member.name }))}
          />
        </section>

        <section aria-labelledby="task-projects-heading" className="grid content-start gap-3">
          <h3 id="task-projects-heading" className="font-medium">
            Проекты
          </h3>
          <TaskPlacements
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            taskId={task.id}
            placements={task.placements}
            statusesByProject={statusesByProject}
          />
          <AddToProjectForm
            // Новый набор свободных проектов (после добавления) — форма с чистыми полями.
            key={freeProjects.map((project) => project.id).join()}
            workspaceId={workspace.id}
            taskId={task.id}
            projects={freeProjects.map(({ id, name }) => ({ id, name }))}
            statusesByProject={statusesByProject}
          />
        </section>
      </div>

      <section
        aria-labelledby="task-attachments-heading"
        className="grid max-w-3xl content-start gap-3 border-t pt-6"
      >
        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
          <TaskAttachmentsSection session={session} workspaceId={workspace.id} taskId={task.id} />
        </Suspense>
      </section>

      <section
        aria-labelledby="task-comments-heading"
        className="grid max-w-3xl content-start gap-3 border-t pt-6"
      >
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <TaskCommentsSection
            session={session}
            workspaceId={workspace.id}
            taskId={task.id}
            taskHref={`/w/${workspace.slug}/tasks/${task.number}`}
            searchParams={searchParams}
          />
        </Suspense>
      </section>
    </article>
  );
}
