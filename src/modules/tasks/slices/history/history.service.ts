import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import type { TransactionClient } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import {
  describeHistoryChange,
  formatTaskKey,
  isTaskHistoryKind,
  mergeHistoryChange,
  parseHistoryData,
  shouldMergeHistory,
  TASK_HISTORY_PAGE_SIZE,
  type HistoryAuthor,
  type HistoryNamedRef,
  type HistoryTaskRef,
  type TaskHistoryChange,
} from '../../models';
import { toCreatedVia, toUserDto } from '../task/task.mapper';
import type { TaskHistoryDto, TaskHistoryItemDto } from './history.dto';
import { historyRepository, type HistoryListRow } from './history.repository';

const log = createLogger('tasks.history');

/** Автор изменения из сессии: пользователь и токен MCP, если действует агент. */
export function historyAuthorOf(session: AuthSession): HistoryAuthor {
  return { actorId: session.user.id, viaTokenId: session.via?.tokenId ?? null, source: null };
}

/** Системный автор: автосмена статуса по событиям GitHub. */
export const GITHUB_HISTORY_AUTHOR: HistoryAuthor = {
  actorId: null,
  viaTokenId: null,
  source: 'github',
};

/**
 * Записывает изменения задачи в той же транзакции, что и само изменение (сбой откатывает оба).
 * Правка, подряд повторяющая последнюю запись того же поля и автора, сливается с ней.
 */
export async function recordHistory(
  tx: TransactionClient,
  input: {
    workspaceId: string;
    taskId: string;
    author: HistoryAuthor;
    changes: readonly TaskHistoryChange[];
    now?: Date;
  },
): Promise<void> {
  const { workspaceId, taskId, author, changes } = input;
  if (changes.length === 0) return;
  const now = input.now ?? new Date();

  let last = await historyRepository.findLast(tx, workspaceId, taskId);
  let merged = 0;
  for (const change of changes) {
    const previous = last ? parseHistoryData(last.kind, last.data) : null;
    if (last && previous && shouldMergeHistory(last, { ...author, kind: change.kind }, now)) {
      const result = mergeHistoryChange(
        { kind: last.kind, data: previous } as TaskHistoryChange,
        change,
      );
      merged += 1;
      if (result === null) {
        // Значение вернули как было — запись больше ничего не описывает.
        await historyRepository.delete(tx, workspaceId, last.id);
        last = null;
      } else {
        await historyRepository.updateData(tx, workspaceId, last.id, result.data);
        last = { ...last, data: result.data, updatedAt: now };
      }
      continue;
    }
    const created = await historyRepository.create(tx, {
      ...author,
      workspaceId,
      taskId,
      kind: change.kind,
      data: change.data,
    });
    last = { ...created, ...author, data: change.data };
  }
  log.debug(
    { workspaceId, taskId, kinds: changes.map((change) => change.kind), merged },
    '[history] recorded',
  );
}

// ── Снимки имён ────────────────────────────────────────────────────────────────

export async function userSnapshot(
  tx: TransactionClient,
  userId: string | null,
): Promise<HistoryNamedRef | null> {
  if (userId === null) return null;
  const user = await historyRepository.userRef(tx, userId);
  return user ? { id: user.id, name: user.name } : { id: userId, name: 'Удалённый пользователь' };
}

/** Статусы с проектами: `status` и `project` для записей о статусе и размещении. */
export async function statusSnapshots(
  tx: TransactionClient,
  workspaceId: string,
  statusIds: readonly string[],
): Promise<Map<string, { status: HistoryNamedRef; project: HistoryNamedRef }>> {
  const rows = await historyRepository.statusRefs(tx, workspaceId, [...new Set(statusIds)]);
  return new Map(
    rows.map((row) => [
      row.id,
      { status: { id: row.id, name: row.name }, project: { ...row.project } },
    ]),
  );
}

export async function taskSnapshot(
  tx: TransactionClient,
  workspaceId: string,
  taskId: string | null,
): Promise<HistoryTaskRef | null> {
  if (taskId === null) return null;
  const [row] = await historyRepository.taskRefs(tx, workspaceId, [taskId]);
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    key: formatTaskKey(row.number, row.workspace.taskKey),
    title: row.title,
  };
}

// ── Чтение ─────────────────────────────────────────────────────────────────────

function toHistoryItem(row: HistoryListRow): TaskHistoryItemDto | null {
  if (!isTaskHistoryKind(row.kind)) return null;
  const data = parseHistoryData(row.kind, row.data);
  if (data === null) return null;
  const actor = toUserDto(row.actor);
  return {
    id: row.id,
    kind: row.kind,
    text: describeHistoryChange({ kind: row.kind, data } as TaskHistoryChange),
    actor: actor && row.actor ? { ...actor, isAgent: row.actor.isAgent } : null,
    source: row.source,
    via: toCreatedVia(row.actor, row.viaToken),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** История задачи от новых к старым: последние `TASK_HISTORY_PAGE_SIZE` или все. */
export async function listTaskHistory(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
  options: { all?: boolean; limit?: number } = {},
): Promise<TaskHistoryDto> {
  await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(taskId)) return { total: 0, items: [] };

  const limit = options.all ? undefined : (options.limit ?? TASK_HISTORY_PAGE_SIZE);
  const { total, rows } = await historyRepository.listForTask(workspaceId, taskId, limit);
  const items = rows.map(toHistoryItem).filter((item) => item !== null);
  log.debug(
    { workspaceId, taskId, total, count: items.length, skipped: rows.length - items.length },
    '[history.listTaskHistory]',
  );
  return { total, items };
}
