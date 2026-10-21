import 'server-only';

import { assertTaskActive, createTask, TASK_TITLE_MAX_LENGTH } from '@/modules/tasks';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { parseStoredActionItems, type StoredActionItem } from '../../models';
import { meetingRepository } from '../meeting/meeting.repository';

const log = createLogger('integrations:meet');

/** Больше поручений за раз не создаём: конспект — до 50 пунктов, диалог шлёт выбранные. */
export const ACTION_ITEMS_BATCH_LIMIT = 20;
/** Пункт «в работе» у другого запроса: метка в subtaskId, пока создаются задачи. */
const PENDING_PREFIX = 'pending:';
/** Через сколько зависшая метка (упавший запрос) перестаёт блокировать пункт. */
const PENDING_TTL_MS = 2 * 60 * 1000;

function isClaimed(item: StoredActionItem, now: number): boolean {
  if (!item.subtaskId) return false;
  if (!item.subtaskId.startsWith(PENDING_PREFIX)) return true;
  return now - Number(item.subtaskId.slice(PENDING_PREFIX.length)) < PENDING_TTL_MS;
}

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function subtaskDescription(item: StoredActionItem, completedAt: Date): string {
  const owner = item.owner ? `, ответственный по конспекту: ${item.owner}` : '';
  return `Поручение из конспекта встречи ${DATE.format(completedAt)}${owner}.`;
}

export interface CreateSubtasksInput {
  workspaceId: string;
  recapId: string;
  items: { index: number; assigneeId?: string | null }[];
}

/**
 * Поручения конспекта → подзадачи задачи встречи. Пункты сначала помечаются под блокировкой
 * строки конспекта (повторный клик или второй участник не создадут дубль), задачи создаются
 * обычным `createTask` с сессией пользователя (те же права и журнал), затем метки заменяются
 * на id подзадач. Сбой — метки снимаются.
 */
export async function createSubtasksFromActionItems(
  session: AuthSession,
  input: CreateSubtasksInput,
): Promise<{ created: number }> {
  const { workspaceId, recapId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId);
  const indexes = [...new Set(input.items.map((item) => item.index))];
  if (indexes.length === 0) throw new ValidationError('Выберите поручения');
  if (indexes.length > ACTION_ITEMS_BATCH_LIMIT) {
    throw new ValidationError(`Не больше ${ACTION_ITEMS_BATCH_LIMIT} поручений за раз`);
  }
  const assignees = new Map(input.items.map((item) => [item.index, item.assigneeId ?? null]));

  const marker = `${PENDING_PREFIX}${Date.now()}`;
  const claim = await prisma.$transaction(async (tx) => {
    const recap = await meetingRepository.lockRecap(tx, recapId);
    if (!recap || recap.meeting.workspaceId !== workspaceId) {
      throw new NotFoundError('Конспект не найден');
    }
    await assertTaskActive(workspaceId, recap.meeting.taskId, tx);
    const items = parseStoredActionItems(recap.actionItems);
    const now = Date.now();
    const free = indexes.filter((index) => {
      const item = items[index];
      return item !== undefined && !isClaimed(item, now);
    });
    for (const index of free) items[index] = { ...items[index]!, subtaskId: marker };
    if (free.length > 0) await meetingRepository.saveActionItems(tx, recapId, [...items]);
    return {
      taskId: recap.meeting.taskId,
      completedAt: recap.completedAt,
      items,
      free,
    };
  });
  if (claim.free.length === 0) {
    log.warn({ workspaceId, recapId, userId }, '[meet.actionItems] nothing to create');
    throw new ValidationError('Эти поручения уже стали задачами');
  }

  const created = new Map<number, string>();
  try {
    for (const index of claim.free) {
      const item = claim.items[index]!;
      const task = await createTask(session, {
        workspaceId,
        title: item.task.slice(0, TASK_TITLE_MAX_LENGTH),
        description: subtaskDescription(item, claim.completedAt),
        parentId: claim.taskId,
        ...(item.due && { dueDate: item.due }),
        ...(assignees.get(index) && { assigneeId: assignees.get(index)! }),
      });
      created.set(index, task.taskId);
    }
  } finally {
    // Метки этого запроса → id созданных подзадач; несозданные пункты освобождаются.
    await prisma.$transaction(async (tx) => {
      const recap = await meetingRepository.lockRecap(tx, recapId);
      if (!recap) return;
      const items = parseStoredActionItems(recap.actionItems).map((item, index) =>
        item.subtaskId === marker ? { ...item, subtaskId: created.get(index) ?? null } : item,
      );
      await meetingRepository.saveActionItems(tx, recapId, items);
    });
    log.info(
      { workspaceId, recapId, userId, requested: claim.free.length, created: created.size },
      '[meet.actionItems] subtasks from action items',
    );
  }
  return { created: created.size };
}
