import 'server-only';

import { isEntityId } from '@/modules/projects';
import type { TransactionClient } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { assertNotArchived } from '../../models';
import { taskRepository } from './task.repository';

const log = createLogger('tasks.archive');

/**
 * Задача есть в пространстве и не в архиве — иначе NOT_FOUND или VALIDATION. Общая проверка для
 * всех изменений задачи (поля, метки, размещения, родитель, комментарии, вложения).
 */
export async function assertTaskActive(
  workspaceId: string,
  taskId: string,
  db?: TransactionClient,
): Promise<void> {
  const row = isEntityId(taskId)
    ? await taskRepository.findArchiveState(workspaceId, taskId, db)
    : null;
  if (!row) throw new NotFoundError('Задача не найдена');
  try {
    assertNotArchived(row);
  } catch (error) {
    log.warn({ workspaceId, taskId }, '[task] change of archived task rejected');
    throw error;
  }
}
