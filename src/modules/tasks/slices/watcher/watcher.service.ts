import 'server-only';

import { notify } from '@/modules/notifications';
import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma, type TransactionClient } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { formatTaskKey } from '../../models';
import type { TaskWatchersDto } from './watcher.dto';
import { watcherRepository } from './watcher.repository';

const log = createLogger('tasks.watcher');

async function requireTask(workspaceId: string, taskId: string): Promise<void> {
  if (!isEntityId(taskId) || !(await watcherRepository.taskExists(workspaceId, taskId))) {
    log.warn({ workspaceId, taskId }, '[watcher] task not found');
    throw new NotFoundError('Задача не найдена');
  }
}

/**
 * Подписывает участников на задачу в той же транзакции, что и действие (создание, назначение,
 * комментарий). Агентов не подписывает: их уведомления маршрутизирует agent-routing.
 */
export async function ensureWatchers(
  tx: TransactionClient,
  workspaceId: string,
  taskId: string,
  userIds: readonly (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const watchable = await watcherRepository.filterWatchable(tx, unique);
  if (watchable.length === 0) return;
  const added = await watcherRepository.addMany(tx, workspaceId, taskId, watchable);
  log.debug({ taskId, added }, '[watcher] ensured');
}

/** Подписаться на задачу или отписаться — только сам за себя. */
export async function setWatching(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; watch: boolean },
): Promise<void> {
  const { workspaceId, taskId, watch } = input;
  const access = await requireWorkspaceAccess(session, workspaceId);
  await requireTask(workspaceId, taskId);
  const userId = access.userId;
  if (watch) {
    await ensureWatchers(prisma, workspaceId, taskId, [userId]);
  } else {
    await watcherRepository.remove(workspaceId, taskId, userId);
  }
  log.info({ workspaceId, taskId, userId }, watch ? '[watcher] watch' : '[watcher] unwatch');
}

/** Наблюдатели задачи (по времени подписки) и подписан ли текущий пользователь. */
export async function listTaskWatchers(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
): Promise<TaskWatchersDto> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  const rows = await watcherRepository.listForTask(workspaceId, taskId);
  const watchers = rows.map(({ user }) => ({
    userId: user.id,
    name: user.name,
    image: user.image,
  }));
  return { watching: watchers.some((user) => user.userId === access.userId), watchers };
}

/** id наблюдателей задачи — для уведомлений (без проверки доступа: вызывают сервисы модуля). */
export function listWatcherIds(workspaceId: string, taskId: string): Promise<string[]> {
  return watcherRepository.listUserIds(workspaceId, taskId);
}

/** Смена статуса для уведомления: имена — снимок на момент изменения. */
export interface StatusChangeNotice {
  workspaceId: string;
  taskId: string;
  projectName: string;
  fromStatus: string;
  toStatus: string;
  /** Автор действия; null — система (интеграция): уведомляются все наблюдатели. */
  actor: { id: string; name: string } | null;
  /** Подпись системного автора («GitHub»). */
  systemName?: string;
}

/**
 * Уведомляет наблюдателей о смене статуса, кроме автора действия. Не бросает: смена статуса
 * уже сохранена, сбой уведомлений только логируется. Возвращает число получателей.
 */
export async function notifyWatchersAboutStatus(notice: StatusChangeNotice): Promise<number> {
  const { workspaceId, taskId, actor } = notice;
  try {
    const [watcherIds, task] = await Promise.all([
      watcherRepository.listUserIds(workspaceId, taskId),
      watcherRepository.findTaskRef(workspaceId, taskId),
    ]);
    const recipients = watcherIds.filter((userId) => userId !== actor?.id);
    if (!task || recipients.length === 0) return 0;
    await notify(
      recipients.map((recipientId) => ({
        type: 'task_status_changed' as const,
        recipientId,
        workspaceId,
        actorId: actor?.id ?? null,
        taskId,
        payload: {
          workspaceSlug: task.workspace.slug,
          workspaceName: task.workspace.name,
          actorName: actor?.name ?? notice.systemName ?? null,
          taskNumber: task.number,
          taskKey: formatTaskKey(task.number, task.workspace.taskKey),
          taskTitle: task.title,
          projectName: notice.projectName,
          fromStatus: notice.fromStatus,
          toStatus: notice.toStatus,
        },
      })),
    );
    return recipients.length;
  } catch (error) {
    // notify не бросает; сюда попадает только сбой чтения наблюдателей.
    log.error({ err: error, workspaceId, taskId }, '[watcher] status notification failed');
    return 0;
  }
}
