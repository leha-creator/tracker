import { Progress } from '@/components/ui/progress';
import type { ProjectStatusDto } from '@/modules/projects';
import { listSubtasks } from '@/modules/tasks';
import type { AuthSession } from '@/shared/auth';

import { AddSubtaskForm } from './add-subtask-form';
import { SubtaskRow } from './subtask-row';

interface TaskSubtasksSectionProps {
  session: AuthSession;
  workspaceId: string;
  task: { id: string; key: string; placements: { projectId: string }[] };
  /** Адрес подзадачи: в той же панели или на странице задачи. */
  taskHref: (number: number) => string;
  /** Полная форма новой подзадачи. */
  newSubtaskHref: string;
  projects: { id: string; name: string }[];
  statusesByProject: Record<string, ProjectStatusDto[]>;
}

/** Раздел «Подзадачи»: прогресс, прямые подзадачи и быстрое добавление. */
export async function TaskSubtasksSection({
  session,
  workspaceId,
  task,
  taskHref,
  newSubtaskHref,
  projects,
  statusesByProject,
}: TaskSubtasksSectionProps) {
  const { items, progress } = await listSubtasks(session, workspaceId, task.id);
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const parentProjectIds = task.placements.map((placement) => placement.projectId);

  return (
    <>
      <div className="flex items-center gap-3">
        <h3 id="task-subtasks-heading" className="text-sm font-semibold">
          Подзадачи
        </h3>
        {progress.total > 0 && (
          <>
            <span className="text-xs text-muted-foreground tabular-nums">
              {progress.done} из {progress.total}
            </span>
            <Progress
              value={percent}
              className="max-w-32"
              aria-label={`Выполнено подзадач: ${progress.done} из ${progress.total}`}
            />
          </>
        )}
      </div>
      {items.length > 0 && (
        <ul className="-mx-2 grid gap-0.5">
          {items.map((subtask) => (
            <SubtaskRow
              key={subtask.id}
              workspaceId={workspaceId}
              subtask={subtask}
              href={taskHref(subtask.number)}
              projects={projects}
              parentProjectIds={parentProjectIds}
              statusesByProject={statusesByProject}
            />
          ))}
        </ul>
      )}
      <AddSubtaskForm
        workspaceId={workspaceId}
        parentId={task.id}
        parentKey={task.key}
        fullFormHref={newSubtaskHref}
      />
    </>
  );
}
