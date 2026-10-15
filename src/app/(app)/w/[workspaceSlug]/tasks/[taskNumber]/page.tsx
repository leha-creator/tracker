import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { AddToProjectForm } from '@/components/tasks/add-to-project-form';
import { TaskDetailsForm } from '@/components/tasks/task-details-form';
import { TaskPlacements } from '@/components/tasks/task-placements';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/workspaces/confirm-action-dialog';
import { listProjects, listWorkspaceStatuses } from '@/modules/projects';
import { deleteTaskAction, getTaskByNumber, taskNumberSchema } from '@/modules/tasks';
import { listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Задача — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/tasks/[taskNumber]'>;

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

export default function TaskPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <TaskSection params={params} />
    </Suspense>
  );
}

async function TaskSection({ params }: Pick<Props, 'params'>) {
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
            description="Задача исчезнет со всех досок. Действие нельзя отменить."
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
    </article>
  );
}
