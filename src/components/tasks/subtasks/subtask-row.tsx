'use client';

import { ListTree, MoreHorizontalIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { StatusDot } from '@/components/projects/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserHoverCard } from '@/components/users/user-hover-card';
import type { ProjectStatusDto } from '@/modules/projects/client';
import { setTaskParentAction, type SubtaskDto } from '@/modules/tasks/client';

import { AddToProjectForm } from '../add-to-project-form';
import { AssigneeAvatar } from '../assignee-avatar';

interface SubtaskRowProps {
  workspaceId: string;
  subtask: SubtaskDto;
  /** Открыть подзадачу: в той же панели или на странице задачи. */
  href: string;
  /** Проекты пространства; проекты родителя — первыми в «Вывести на доску». */
  projects: { id: string; name: string }[];
  parentProjectIds: string[];
  statusesByProject: Record<string, ProjectStatusDto[]>;
}

/**
 * Строка подзадачи: ключ, название, статусы в проектах, свои подзадачи, ответственный и меню —
 * «Вывести на доску» (размещение в проекте) и «Отвязать от задачи».
 */
export function SubtaskRow({
  workspaceId,
  subtask,
  href,
  projects,
  parentProjectIds,
  statusesByProject,
}: SubtaskRowProps) {
  const [placing, setPlacing] = useState(false);
  const [detaching, startDetach] = useTransition();
  const placedIds = new Set(subtask.placements.map((placement) => placement.projectId));
  const freeProjects = projects
    .filter((project) => !placedIds.has(project.id))
    .sort(
      (a, b) => Number(parentProjectIds.includes(b.id)) - Number(parentProjectIds.includes(a.id)),
    );
  const closePlacing = useCallback(() => setPlacing(false), []);

  function detach() {
    startDetach(async () => {
      const result = await setTaskParentAction({ workspaceId, taskId: subtask.id, parentId: null });
      if (result.ok) toast.success(`${subtask.key} — теперь задача верхнего уровня`);
      else toast.error(result.error.message);
    });
  }

  return (
    <li
      className="group/subtask flex min-h-10 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 data-pending:opacity-60"
      data-pending={detaching || undefined}
    >
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
        {subtask.key}
      </span>
      <Link
        href={href}
        scroll={false}
        className="min-w-0 flex-1 truncate rounded-sm text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {subtask.title}
      </Link>

      {subtask.placements.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          {subtask.placements.map((placement) => (
            <span
              key={placement.projectId}
              title={`${placement.projectName}: ${placement.statusName}`}
              className="inline-flex items-center"
            >
              <StatusDot color={placement.statusColor} />
              <span className="sr-only">
                {placement.projectName}: {placement.statusName}
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="hidden shrink-0 text-xs text-muted-foreground @sm:inline">
          не на доске
        </span>
      )}

      {subtask.subtaskCount > 0 && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
          title={`Своих подзадач: ${subtask.subtaskCount}`}
        >
          <ListTree aria-hidden className="size-3.5" />
          {subtask.subtaskCount}
          <span className="sr-only"> подзадач</span>
        </span>
      )}

      {subtask.assignee && (
        <UserHoverCard user={subtask.assignee} className="shrink-0">
          <AssigneeAvatar user={subtask.assignee} />
        </UserHoverCard>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={`Действия: ${subtask.key}`}
            disabled={detaching}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem asChild>
            <Link href={href} scroll={false}>
              Открыть
            </Link>
          </DropdownMenuItem>
          {freeProjects.length > 0 && (
            <DropdownMenuItem onSelect={() => setPlacing(true)}>Вывести на доску…</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={detach}>Отвязать от задачи</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Диалог — вне меню: закрытие меню не должно размонтировать открытый диалог. */}
      <Dialog open={placing} onOpenChange={setPlacing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вывести на доску</DialogTitle>
            <DialogDescription>
              {subtask.key} «{subtask.title}» появится в колонке выбранного статуса.
            </DialogDescription>
          </DialogHeader>
          {placing && (
            <AddToProjectForm
              defaultOpen
              workspaceId={workspaceId}
              taskId={subtask.id}
              projects={freeProjects}
              // Проект родителя — первым в списке и выбран сразу.
              defaultProjectId={
                parentProjectIds.includes(freeProjects[0]?.id ?? '')
                  ? freeProjects[0]?.id
                  : undefined
              }
              statusesByProject={statusesByProject}
              onCancel={closePlacing}
              onDone={closePlacing}
            />
          )}
        </DialogContent>
      </Dialog>
    </li>
  );
}
