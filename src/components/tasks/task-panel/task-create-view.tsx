import { listProjects, listWorkspaceStatuses } from '@/modules/projects';
import { getTaskByNumber } from '@/modules/tasks';
import { listMembers } from '@/modules/workspaces';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

import { CreateTaskForm } from '../create-task-form';
import { TaskCloseLink, TaskToolbar } from './task-toolbar';

export interface TaskCreateViewProps {
  session: AuthSession;
  workspaceId: string;
  variant: 'panel' | 'page';
  closeHref: string;
  /** Страница под панелью — после создания на ней откроется новая задача. */
  returnTo?: string;
  defaultProjectId?: string;
  /** Номер родителя (`?parent=12`): форма создаёт подзадачу. */
  parentNumber?: number | null;
}

/** Создание задачи в панели или на странице `/tasks/new`. */
export async function TaskCreateView({
  session,
  workspaceId,
  variant,
  closeHref,
  returnTo,
  defaultProjectId,
  parentNumber,
}: TaskCreateViewProps) {
  const [members, projects, statusesByProject, parent] = await Promise.all([
    listMembers(session, workspaceId),
    listProjects(session, workspaceId),
    listWorkspaceStatuses(session, workspaceId),
    // Родитель не найден — обычная форма без родителя.
    parentNumber
      ? getTaskByNumber(session, workspaceId, parentNumber).catch((error: unknown) => {
          if (error instanceof NotFoundError) return null;
          throw error;
        })
      : null,
  ]);
  const Heading = variant === 'page' ? 'h1' : 'h2';

  return (
    <section aria-labelledby="new-task-heading" className="flex min-h-full flex-col">
      <TaskToolbar
        sticky={variant === 'panel'}
        start={
          <Heading id="new-task-heading" className="text-sm font-medium">
            {parent ? 'Новая подзадача' : 'Новая задача'}
          </Heading>
        }
      >
        <TaskCloseLink href={closeHref} variant={variant} />
      </TaskToolbar>
      <CreateTaskForm
        workspaceId={workspaceId}
        members={members.map(({ userId, name, image }) => ({ userId, name, image }))}
        projects={projects.map(({ id, name }) => ({ id, name }))}
        statusesByProject={statusesByProject}
        // Неизвестный проект просто не выбирается: форма проверяет его по списку статусов.
        defaultProjectId={defaultProjectId}
        returnTo={returnTo}
        closeHref={closeHref}
        parent={parent ? { id: parent.id, key: parent.key, title: parent.title } : undefined}
      />
    </section>
  );
}
