import 'server-only';

import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';
import { publishRealtimeEvent, type RealtimeEventKind } from '@/shared/realtime';

import { placementRepository } from '../placement/placement.repository';

const log = createLogger('tasks.events');

export interface TaskEventInput {
  workspaceId: string;
  kind: Exclude<RealtimeEventKind, 'resync'>;
  taskId: string;
  taskNumber?: number;
  /** Затронутые доски. Не передан — берутся все проекты задачи и `relatedTaskIds`. */
  projectIds?: readonly string[];
  /** Ещё задачи, чьи доски затронуты (поддерево при архивации). */
  relatedTaskIds?: readonly string[];
}

/**
 * Сигнал реалтайма об изменении задачи. Вызывать после коммита транзакции. Никогда не бросает:
 * сбой реалтайма не ломает изменение. `session = null` — системное изменение (GitHub).
 */
export async function emitTaskEvent(
  session: AuthSession | null,
  input: TaskEventInput,
): Promise<void> {
  const { workspaceId, kind, taskId, taskNumber } = input;
  try {
    const projectIds = input.projectIds
      ? [...new Set(input.projectIds)]
      : await placementRepository.listProjectIdsOfTasks(workspaceId, [
          taskId,
          ...(input.relatedTaskIds ?? []),
        ]);
    log.debug({ kind, workspaceId, taskId, projects: projectIds.length }, '[task.events] emit');
    await publishRealtimeEvent({
      workspaceId,
      kind,
      taskId,
      ...(taskNumber !== undefined && { taskNumber }),
      projectIds,
      actorId: session?.user.id ?? null,
    });
  } catch (error) {
    log.warn({ err: error, kind, workspaceId, taskId }, '[task.events] emit failed');
  }
}

/** Изменение, задевающее много задач (метка переименована или удалена): обновить всё. */
export async function emitWorkspaceResync(
  session: AuthSession | null,
  workspaceId: string,
): Promise<void> {
  log.debug({ workspaceId }, '[task.events] resync');
  await publishRealtimeEvent({
    workspaceId,
    kind: 'resync',
    projectIds: [],
    actorId: session?.user.id ?? null,
  });
}
