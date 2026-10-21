import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

import { parseStoredActionItems } from '../../models';
import type { TaskMeetingDto } from './meeting.dto';
import { meetingRepository } from './meeting.repository';

const log = createLogger('integrations:meet');

/** Номера созданных подзадач — для ссылок в разделе «Созвоны». */
async function loadSubtaskNumbers(
  workspaceId: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await meetingRepository.findTaskNumbers(workspaceId, ids);
  return new Map(rows.map((row) => [row.id, row.number]));
}

/** Созвоны задачи (новые сверху) — любому участнику пространства. */
export async function listTaskMeetings(
  session: AuthSession,
  input: { workspaceId: string; taskId: string },
): Promise<TaskMeetingDto[]> {
  const { workspaceId, taskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await meetingRepository.listTaskMeetings(workspaceId, taskId);

  const recaps = rows.flatMap((row) =>
    row.recaps.map((recap) => ({ recap, items: parseStoredActionItems(recap.actionItems) })),
  );
  const subtaskIds = recaps.flatMap(({ items }) =>
    items.flatMap((item) => (item.subtaskId ? [item.subtaskId] : [])),
  );
  const numbers = await loadSubtaskNumbers(workspaceId, subtaskIds);
  const itemsByRecap = new Map(recaps.map(({ recap, items }) => [recap.id, items]));
  log.debug(
    { workspaceId, taskId, meetings: rows.length, recaps: recaps.length },
    '[meet.listTaskMeetings]',
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    url: row.url,
    host: row.hostUser,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    recaps: row.recaps.map((recap) => ({
      id: recap.id,
      completedAt: recap.completedAt,
      document:
        recap.documentId && recap.document
          ? { id: recap.documentId, title: recap.document.title }
          : null,
      actionItems: (itemsByRecap.get(recap.id) ?? []).map((item, index) => {
        const number = item.subtaskId ? numbers.get(item.subtaskId) : undefined;
        return {
          index,
          owner: item.owner,
          task: item.task,
          due: item.due,
          // Подзадачу удалили — поручение снова можно превратить в задачу.
          subtask: item.subtaskId && number !== undefined ? { id: item.subtaskId, number } : null,
        };
      }),
    })),
  }));
}
